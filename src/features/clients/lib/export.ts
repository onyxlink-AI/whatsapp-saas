import ExcelJS from "exceljs";
import { CLIENT_STATUS_LABELS, type ClientRow } from "@/features/clients/types";

/** Builds a .xlsx file from the given clients and triggers a browser download. */
export async function exportClientsToExcel(clients: ClientRow[]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Clientes");

  sheet.columns = [
    { header: "Nombre", key: "name", width: 24 },
    { header: "Empresa", key: "company", width: 22 },
    { header: "Teléfono", key: "phone", width: 16 },
    { header: "Email", key: "email", width: 26 },
    { header: "Estado", key: "status", width: 14 },
    { header: "Notas", key: "notes", width: 30 },
    { header: "Creado", key: "created_at", width: 14 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const client of clients) {
    sheet.addRow({
      name: client.name ?? "",
      company: client.company?.name ?? "",
      phone: client.phone,
      email: client.email ?? "",
      status: CLIENT_STATUS_LABELS[client.client_status],
      notes: client.notes ?? "",
      created_at: new Date(client.created_at).toLocaleDateString("es-MX"),
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `clientes-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
