import type { QuestionTable } from "@/lib/types";

// Renders a numerical-reasoning data table above the question stem. Shared by
// the timed runners and the learn mode so the table styling never drifts.
export default function QuestionTableView({ table }: { table: QuestionTable }) {
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {table.caption && (
          <caption className="mb-1 text-left font-semibold text-neutral-800">
            {table.caption}
          </caption>
        )}
        <thead>
          <tr>
            {table.headers.map((h, i) => (
              <th
                key={i}
                className="border border-neutral-300 bg-neutral-100 px-2 py-1 text-left font-semibold"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className="border border-neutral-300 px-2 py-1 tabular-nums">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
