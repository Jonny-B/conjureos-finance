import { useState } from "react";
import { useFinance } from "../store/FinanceContext";
import type { Category } from "../api/types";
import { CategoryChip } from "./common";

const PALETTE = ["#22c55e", "#f97316", "#3b82f6", "#a855f7", "#ef4444", "#eab308", "#ec4899", "#06b6d4", "#14b8a6", "#8b5cf6"];

export function Categories() {
  const { categories, api, refresh } = useFinance();
  const [name, setName] = useState("");
  const [color, setColor] = useState(PALETTE[0]);

  async function add() {
    if (!name.trim()) return;
    // Icons are rendered from a Font Awesome map keyed by category id; custom
    // categories fall back to a tag glyph, so the stored value is just a marker.
    await api.createCategory({ name: name.trim(), icon: "tag", color, parentId: null });
    setName("");
    refresh();
  }

  async function remove(c: Category) {
    await api.deleteCategory(c.id);
    refresh();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="page-title">Categories</div>
          <div className="page-sub">System categories plus any you add</div>
        </div>
      </div>

      <div className="cui-card" style={{ marginBottom: 16 }}>
        <div className="card-title">New category</div>
        <div className="row wrap" style={{ gap: 10, alignItems: "flex-end" }}>
          <div className="field" style={{ flex: 1, minWidth: 160 }}>
            <label>Name</label>
            <input className="cui-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pets" />
          </div>
          <div className="field">
            <label>Color</label>
            <div className="row" style={{ gap: 6 }}>
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  title={c}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 6,
                    background: c,
                    border: color === c ? "2px solid #fff" : "2px solid transparent",
                  }}
                />
              ))}
            </div>
          </div>
          <button className="cui-button cui-button--primary" onClick={add}>Add</button>
        </div>
      </div>

      <div className="cui-card" style={{ padding: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Type</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td>
                  <CategoryChip category={c} />
                </td>
                <td className="faint">{c.isSystem ? "System" : "Custom"}</td>
                <td style={{ textAlign: "right" }}>
                  {!c.isSystem && (
                    <button className="cui-button cui-button--ghost btn-sm" onClick={() => remove(c)}>Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
