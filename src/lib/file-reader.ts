import * as XLSX from "xlsx";
import type { RawRow, ParsedFile } from "@/types";

export async function readExcel(file: File): Promise<ParsedFile> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  const sheets = workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      header: 1,
      defval: null,
      blankrows: false,
    });

    const rows: RawRow[] = (jsonData as unknown as unknown[][]).map((rowArr, idx) => ({
      rowNum: idx + 1,
      cells: rowArr.map((cell) => {
        if (cell === null || cell === undefined) return null;
        return String(cell);
      }),
    }));

    return { name, rows };
  });

  const allRows = sheets.length > 0 ? sheets[0].rows : [];

  return {
    fileName: file.name,
    fileType: "excel",
    sheets: sheets.length > 1 ? sheets : undefined,
    rows: allRows,
  };
}

export async function readPdf(file: File): Promise<ParsedFile> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs`;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const allRows: RawRow[] = [];
  let sampleText = "";

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    const lines: string[] = [];
    let lastY: number | null = null;

    for (const item of textContent.items) {
      if ("str" in item && "transform" in item) {
        const text = item.str.trim();
        if (!text) continue;
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 3) {
          lines.push("");
        }
        lines[lines.length - 1] = ((lines[lines.length - 1] || "") + " " + text).trim();
        lastY = y;
      }
    }

    sampleText += `--- Page ${i} ---\n${lines.join("\n")}\n\n`;

    lines.filter(Boolean).forEach((line, idx) => {
      allRows.push({ rowNum: allRows.length + 1, cells: [line] });
    });
  }

  return {
    fileName: file.name,
    fileType: "pdf",
    rows: allRows,
    sampleText,
  };
}

export async function readFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xlsx" || ext === "xls") {
    return readExcel(file);
  }
  if (ext === "pdf") {
    return readPdf(file);
  }
  throw new Error(`不支持的文件格式: .${ext}`);
}
