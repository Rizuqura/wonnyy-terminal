const fs = require("node:fs");
const path = require("node:path");
function imagePdf() {
  const image = fs.readFileSync(path.join(__dirname, "ocr-text.jpg"));
  const stream = "q 900 0 0 160 0 0 cm /Im0 Do Q";
  const bodies = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    Buffer.from(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 900 160] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>",
    ),
    Buffer.concat([
      Buffer.from(
        `<< /Type /XObject /Subtype /Image /Width 900 /Height 160 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`,
      ),
      image,
      Buffer.from("\nendstream"),
    ]),
    Buffer.from(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`),
  ];
  const chunks = [Buffer.from("%PDF-1.4\n")],
    offsets = [0];
  for (let i = 0; i < bodies.length; i++) {
    offsets.push(Buffer.concat(chunks).length);
    chunks.push(
      Buffer.from(`${i + 1} 0 obj\n`),
      bodies[i],
      Buffer.from("\nendobj\n"),
    );
  }
  const xref = Buffer.concat(chunks).length;
  chunks.push(
    Buffer.from(
      `xref\n0 6\n0000000000 65535 f \n${offsets
        .slice(1)
        .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
        .join(
          "",
        )}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(chunks);
}
module.exports = { imagePdf };
