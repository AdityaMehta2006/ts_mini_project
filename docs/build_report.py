"""
build_report.py
---------------
Renders REPORT.md to a single self-contained REPORT.html — images inlined as
data URIs, print stylesheet included, no external requests.

This exists because pandoc + xelatex is a heavy install for one PDF. With
`--pdf` it drives an already-installed Chrome or Edge in headless mode to print
that HTML, which needs nothing beyond a browser every Windows machine already
has. Without a browser it still writes the HTML and says so.

    python docs/build_report.py          # HTML only
    python docs/build_report.py --pdf    # HTML, then print it to REPORT.pdf
"""

import base64
import os
import pathlib
import re
import shutil
import subprocess
import sys

from markdown_it import MarkdownIt

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "REPORT.md")
OUT = os.path.join(HERE, "REPORT.html")
OUT_PDF = os.path.join(HERE, "REPORT.pdf")

CSS = """
@page { size: A4; margin: 18mm 16mm; }
:root {
  --ink: #1a1a1a; --muted: #5a5a5a; --rule: #d8d8d8;
  --accent: #b26b00; --sunk: #f7f7f5;
}
* { box-sizing: border-box; }
body {
  max-width: 820px; margin: 0 auto; padding: 40px 28px;
  font: 11.5pt/1.65 "Charter", "Georgia", "Times New Roman", serif;
  color: var(--ink); background: #fff;
}
h1, h2, h3 { font-family: "Inter", "Segoe UI", system-ui, sans-serif; line-height: 1.25; }
h1 { font-size: 20pt; border-bottom: 2px solid var(--accent); padding-bottom: 6px;
     margin-top: 2em; page-break-before: always; }
h1:first-of-type { page-break-before: avoid; margin-top: 0; }
h2 { font-size: 14pt; color: var(--accent); margin-top: 1.6em; }
h3 { font-size: 12pt; margin-top: 1.3em; }
p { margin: 0.7em 0; text-align: justify; hyphens: auto; }
table { border-collapse: collapse; width: 100%; margin: 1.1em 0;
        font-size: 10pt; font-variant-numeric: tabular-nums;
        page-break-inside: avoid; }
th, td { border: 1px solid var(--rule); padding: 5px 9px; text-align: left; }
th { background: var(--sunk); font-weight: 600; }
td:not(:first-child), th:not(:first-child) { text-align: right; }
img { max-width: 100%; display: block; margin: 1.2em auto;
      border: 1px solid var(--rule); page-break-inside: avoid; }
code { font-family: "JetBrains Mono", Consolas, monospace; font-size: 9.5pt;
       background: var(--sunk); padding: 1px 4px; border-radius: 2px; }
pre { background: var(--sunk); border: 1px solid var(--rule); padding: 10px 12px;
      overflow-x: auto; page-break-inside: avoid; }
pre code { background: none; padding: 0; }
blockquote { border-left: 3px solid var(--accent); margin: 1em 0;
             padding: 0.2em 0 0.2em 14px; color: var(--muted); }
strong { color: #000; }
/* Every `---` in the source sits immediately before a section heading, and h1
   already forces a page break and draws its own rule. Left visible, the hr is
   pushed onto a fresh page and the heading onto the one after it — eleven
   near-blank pages in a 25-page report. */
hr { display: none; }
ul, ol { padding-left: 1.4em; }
li { margin: 0.35em 0; }
.frontmatter { border-bottom: 2px solid var(--accent); padding-bottom: 18px;
               margin-bottom: 28px; }
.frontmatter .title { font-family: "Inter", system-ui, sans-serif;
                      font-size: 22pt; font-weight: 700; line-height: 1.2; }
.frontmatter .sub { color: var(--muted); font-size: 12pt; margin-top: 6px; }
.frontmatter .authors { margin-top: 14px; font-size: 10.5pt; }
.frontmatter .authors div { margin: 2px 0; }
@media print { body { padding: 0; max-width: none; } }
"""


def front_matter(text: str):
    """Split the YAML block off the top and render it as a title block."""
    m = re.match(r"^---\n(.*?)\n---\n", text, flags=re.S)
    if not m:
        return "", text
    raw, body = m.group(1), text[m.end():]

    def field(name):
        got = re.search(rf"^{name}:\s*\"?(.*?)\"?$", raw, flags=re.M)
        return got.group(1).strip() if got else ""

    authors = re.findall(r"^\s+-\s+(.*)$", raw, flags=re.M)
    html = ['<div class="frontmatter">',
            f'<div class="title">{field("title")}</div>',
            f'<div class="sub">{field("subtitle")} · {field("date")}</div>',
            '<div class="authors">']
    html += [f"<div>{a}</div>" for a in authors]
    html += ["</div></div>"]
    return "\n".join(html), body


def inline_images(html: str) -> str:
    """Replace figure src paths with base64 data URIs so the file stands alone."""
    def repl(m):
        src = m.group(1)
        path = os.path.join(HERE, src)
        if not os.path.exists(path):
            print(f"  ! missing image {src}")
            return m.group(0)
        b64 = base64.b64encode(open(path, "rb").read()).decode()
        return f'src="data:image/png;base64,{b64}"'

    return re.sub(r'src="([^"]+\.png)"', repl, html)


BROWSERS = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]


def find_browser():
    """First Chromium on disk, or on PATH. None if the machine has neither."""
    for path in BROWSERS:
        if os.path.exists(path):
            return path
    for name in ("msedge", "chrome", "chromium", "google-chrome"):
        found = shutil.which(name)
        if found:
            return found
    return None


def print_pdf() -> bool:
    """Print REPORT.html to REPORT.pdf with headless Chromium.

    The page's own @page rule supplies A4 and the margins, so the only flags
    needed are the ones that suppress Chrome's default header and footer.
    """
    browser = find_browser()
    if not browser:
        print("  ! no Chrome or Edge found — open REPORT.html and print to PDF by hand.")
        return False

    cmd = [
        browser,
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={OUT_PDF}",
        pathlib.Path(OUT).as_uri(),
    ]
    done = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
    if not os.path.exists(OUT_PDF):
        print(f"  ! {os.path.basename(browser)} wrote no PDF (exit {done.returncode})")
        print(done.stderr.strip()[:500])
        return False

    mb = os.path.getsize(OUT_PDF) / 1024 / 1024
    print(f"Wrote {OUT_PDF} ({mb:.1f} MB) via {os.path.basename(browser)}.")
    return True


def main() -> int:
    if not os.path.exists(SRC):
        print("REPORT.md not found")
        return 1

    text = open(SRC, encoding="utf-8").read()
    title_html, body = front_matter(text)

    md = MarkdownIt("commonmark", {"html": True}).enable("table").enable("strikethrough")
    rendered = inline_images(md.render(body))

    page = (
        "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
        "<title>How Predictable Is ASML?</title>\n"
        f"<style>{CSS}</style>\n</head>\n<body>\n{title_html}\n{rendered}\n</body>\n</html>\n"
    )
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(page)

    kb = os.path.getsize(OUT) / 1024
    print(f"Wrote {OUT} ({kb:,.0f} KB, images embedded).")

    if "--pdf" in sys.argv:
        return 0 if print_pdf() else 1

    print("Run with --pdf to print it, or open it and print to PDF from a browser.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
