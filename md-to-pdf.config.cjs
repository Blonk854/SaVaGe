module.exports = {
  dest: "USER_MANUAL.pdf",
  pdf_options: {
    format: "Letter",
    margin: { top: "18mm", right: "16mm", bottom: "18mm", left: "16mm" },
    printBackground: true,
  },
  launch_options: {
    executablePath:
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    args: ["--no-sandbox"],
  },
  css: `
    body { font-family: Segoe UI, Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.45; color: #111; }
    h1 { font-size: 22pt; border-bottom: 2px solid #B8FF3C; padding-bottom: 0.25em; }
    h2 { font-size: 14pt; margin-top: 1.4em; color: #0B0D10; }
    h3 { font-size: 12pt; }
    code, pre { font-family: Consolas, monospace; font-size: 9.5pt; }
    pre { background: #f4f4f5; padding: 0.75em; border-radius: 6px; }
    table { border-collapse: collapse; width: 100%; margin: 0.8em 0; font-size: 10pt; }
    th, td { border: 1px solid #ccc; padding: 0.35em 0.5em; text-align: left; vertical-align: top; }
    th { background: #f4f4f5; }
    a { color: #15803d; }
    hr { border: 0; border-top: 1px solid #ddd; margin: 1.5em 0; }
  `,
};
