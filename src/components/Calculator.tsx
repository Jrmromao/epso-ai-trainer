"use client";

import { useState } from "react";

// On-screen calculator mirroring the one provided in the real EPSO numerical
// reasoning test (4-function + %, +/-, AC). Having it in-app is FAITHFUL to the
// exam — the real test provides a calculator — so practising with it trains the
// real conditions rather than a crutch. Pure client state, no persistence.

type Op = "+" | "-" | "×" | "÷";

export default function Calculator() {
  const [display, setDisplay] = useState("0");
  const [acc, setAcc] = useState<number | null>(null);
  const [op, setOp] = useState<Op | null>(null);
  const [fresh, setFresh] = useState(true); // next digit starts a new number

  function inputDigit(d: string) {
    setDisplay((cur) => {
      if (fresh) {
        setFresh(false);
        return d === "." ? "0." : d;
      }
      if (d === "." && cur.includes(".")) return cur;
      return cur === "0" && d !== "." ? d : cur + d;
    });
  }

  function clearAll() {
    setDisplay("0");
    setAcc(null);
    setOp(null);
    setFresh(true);
  }

  function toggleSign() {
    setDisplay((cur) => (cur.startsWith("-") ? cur.slice(1) : cur === "0" ? cur : "-" + cur));
  }

  function percent() {
    setDisplay((cur) => String(parseFloat(cur) / 100));
    setFresh(true);
  }

  function apply(a: number, b: number, o: Op): number {
    if (o === "+") return a + b;
    if (o === "-") return a - b;
    if (o === "×") return a * b;
    return b === 0 ? NaN : a / b;
  }

  function chooseOp(next: Op) {
    const cur = parseFloat(display);
    if (acc !== null && op && !fresh) {
      const result = apply(acc, cur, op);
      setAcc(result);
      setDisplay(String(result));
    } else {
      setAcc(cur);
    }
    setOp(next);
    setFresh(true);
  }

  function equals() {
    if (acc === null || !op) return;
    const cur = parseFloat(display);
    const result = apply(acc, cur, op);
    setDisplay(Number.isNaN(result) ? "Error" : String(result));
    setAcc(null);
    setOp(null);
    setFresh(true);
  }

  const keys: { label: string; onClick: () => void; kind?: "op" | "fn" }[] = [
    { label: "AC", onClick: clearAll, kind: "fn" },
    { label: "±", onClick: toggleSign, kind: "fn" },
    { label: "%", onClick: percent, kind: "fn" },
    { label: "÷", onClick: () => chooseOp("÷"), kind: "op" },
    { label: "7", onClick: () => inputDigit("7") },
    { label: "8", onClick: () => inputDigit("8") },
    { label: "9", onClick: () => inputDigit("9") },
    { label: "×", onClick: () => chooseOp("×"), kind: "op" },
    { label: "4", onClick: () => inputDigit("4") },
    { label: "5", onClick: () => inputDigit("5") },
    { label: "6", onClick: () => inputDigit("6") },
    { label: "-", onClick: () => chooseOp("-"), kind: "op" },
    { label: "1", onClick: () => inputDigit("1") },
    { label: "2", onClick: () => inputDigit("2") },
    { label: "3", onClick: () => inputDigit("3") },
    { label: "+", onClick: () => chooseOp("+"), kind: "op" },
    { label: "0", onClick: () => inputDigit("0") },
    { label: ".", onClick: () => inputDigit(".") },
    { label: "=", onClick: equals, kind: "op" },
  ];

  return (
    <div className="w-64 rounded-lg border border-neutral-300 bg-white shadow-sm">
      <div className="rounded-t-lg bg-neutral-900 px-3 py-1 text-xs font-semibold text-white">
        CALCULATOR
      </div>
      <div className="border-b border-neutral-200 px-3 py-3 text-right font-mono text-2xl tabular-nums text-neutral-900 break-all">
        {display}
      </div>
      <div className="grid grid-cols-4 gap-px bg-neutral-200 p-px">
        {keys.map((k) => (
          <button
            key={k.label}
            onClick={k.onClick}
            className={`py-3 text-sm font-medium transition ${
              k.kind === "op"
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : k.kind === "fn"
                  ? "bg-neutral-100 text-neutral-800 hover:bg-neutral-200"
                  : "bg-white text-neutral-900 hover:bg-neutral-50"
            } ${k.label === "0" ? "col-span-2" : ""}`}
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}
