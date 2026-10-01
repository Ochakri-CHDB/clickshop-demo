"use client";

import { useEffect, useRef } from "react";
import Editor from "react-simple-code-editor";
import Prism from "prismjs";
import "prismjs/components/prism-python";
import "prismjs/components/prism-sql";
import { useTheme } from "@/lib/theme-context";

const DARK_THEME = `
.code-editor .token.comment,
.code-editor .token.prolog,
.code-editor .token.doctype { color: #6b7280; font-style: italic; }
.code-editor .token.keyword { color: #c084fc; font-weight: 600; }
.code-editor .token.string,
.code-editor .token.char { color: #86efac; }
.code-editor .token.number { color: #fbbf24; }
.code-editor .token.boolean { color: #f472b6; }
.code-editor .token.function { color: #60a5fa; }
.code-editor .token.operator { color: #e2e8f0; }
.code-editor .token.punctuation { color: #94a3b8; }
.code-editor .token.builtin { color: #67e8f9; }
.code-editor .token.class-name { color: #fcd34d; }
.code-editor .token.decorator { color: #f472b6; }
.code-editor .token.triple-quoted-string { color: #86efac; }
.code-editor .token.constant { color: #fb923c; }
.code-editor .token.variable { color: #e2e8f0; }
.code-editor .token.important { color: #f87171; font-weight: 600; }
.code-editor .token.atrule,
.code-editor .token.attr-value { color: #86efac; }
.code-editor .token.selector,
.code-editor .token.attr-name { color: #67e8f9; }
`;

const LIGHT_THEME = `
.code-editor .token.comment,
.code-editor .token.prolog,
.code-editor .token.doctype { color: #6b7280; font-style: italic; }
.code-editor .token.keyword { color: #7c3aed; font-weight: 600; }
.code-editor .token.string,
.code-editor .token.char { color: #059669; }
.code-editor .token.number { color: #d97706; }
.code-editor .token.boolean { color: #db2777; }
.code-editor .token.function { color: #2563eb; }
.code-editor .token.operator { color: #334155; }
.code-editor .token.punctuation { color: #64748b; }
.code-editor .token.builtin { color: #0891b2; }
.code-editor .token.class-name { color: #ca8a04; }
.code-editor .token.decorator { color: #db2777; }
.code-editor .token.triple-quoted-string { color: #059669; }
.code-editor .token.constant { color: #ea580c; }
.code-editor .token.variable { color: #334155; }
.code-editor .token.important { color: #dc2626; font-weight: 600; }
.code-editor .token.atrule,
.code-editor .token.attr-value { color: #059669; }
.code-editor .token.selector,
.code-editor .token.attr-name { color: #0891b2; }
`;

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: "python" | "sql";
  placeholder?: string;
  minHeight?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  readOnly?: boolean;
}

export function CodeEditor({
  value,
  onChange,
  language,
  placeholder,
  minHeight = "120px",
  onKeyDown,
  readOnly = false,
}: CodeEditorProps) {
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    let el = document.getElementById("code-editor-theme");
    if (!el) {
      el = document.createElement("style");
      el.id = "code-editor-theme";
      document.head.appendChild(el);
    }
    el.textContent = theme === "light" ? LIGHT_THEME : DARK_THEME;
  }, [theme]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const textarea = container.querySelector("textarea");
    if (!textarea) return;

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      const text = e.dataTransfer?.getData("text/plain");
      if (!text) return;
      const pos = textarea.selectionStart ?? valueRef.current.length;
      const v = valueRef.current;
      onChangeRef.current(v.slice(0, pos) + text + v.slice(pos));
    };

    textarea.addEventListener("dragover", handleDragOver);
    textarea.addEventListener("drop", handleDrop);
    return () => {
      textarea.removeEventListener("dragover", handleDragOver);
      textarea.removeEventListener("drop", handleDrop);
    };
  }, []);

  const highlight = (code: string) => {
    const grammar = language === "python" ? Prism.languages.python : Prism.languages.sql;
    return Prism.highlight(code, grammar, language);
  };

  return (
    <div className="code-editor" ref={containerRef} onKeyDown={onKeyDown}>
      <Editor
        value={value}
        onValueChange={readOnly ? () => {} : onChange}
        highlight={highlight}
        placeholder={placeholder}
        padding={16}
        style={{
          fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
          fontSize: "13px",
          lineHeight: "1.6",
          minHeight,
          color: "var(--fg)",
          backgroundColor: "transparent",
          caretColor: "var(--brand)",
        }}
        textareaClassName="outline-none"
        readOnly={readOnly}
      />
    </div>
  );
}
