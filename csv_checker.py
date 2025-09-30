"""Graphical CSV comparison tool.

This module provides functionality to compare two CSV files by a key field
and highlight any differences. It also exposes a Tkinter based GUI for
interactive usage.
"""
from __future__ import annotations

import csv
import os
from collections import defaultdict
from dataclasses import dataclass
from typing import Dict, Iterable, List, Sequence, Set

import tkinter as tk
from tkinter import filedialog, messagebox, ttk


@dataclass(frozen=True)
class Difference:
    """Represents a difference between two CSV files."""

    policy_no: str
    column: str
    value_a: str
    value_b: str


class CsvComparisonError(Exception):
    """Custom exception for CSV comparison errors."""


def read_csv_sorted(file_path: str, key_field: str) -> List[Dict[str, str]]:
    """Read a CSV file, ensuring the key field exists, and return sorted rows."""
    if not os.path.exists(file_path):
        raise CsvComparisonError(f"Файл не найден: {file_path}")

    with open(file_path, "r", encoding="utf-8-sig", newline="") as csv_file:
        reader = csv.DictReader(csv_file)
        if reader.fieldnames is None:
            raise CsvComparisonError("CSV файл не содержит заголовков.")
        if key_field not in reader.fieldnames:
            raise CsvComparisonError(
                f"В файле {file_path} отсутствует ключевой столбец '{key_field}'."
            )

        rows = [row for row in reader]

    try:
        rows.sort(key=lambda row: row.get(key_field, ""))
    except TypeError as error:
        raise CsvComparisonError(
            "Ошибка сортировки. Проверьте корректность значений в столбце ключа."
        ) from error

    return rows


def detect_duplicate_keys(rows: Iterable[Dict[str, str]], key_field: str) -> List[str]:
    """Return a list of duplicate key values."""
    occurrences: Dict[str, int] = defaultdict(int)
    duplicates: List[str] = []
    for row in rows:
        key_value = row.get(key_field, "")
        occurrences[key_value] += 1
        if occurrences[key_value] == 2:
            duplicates.append(key_value)
    return duplicates


def compare_csv_files(
    file_path_a: str,
    file_path_b: str,
    key_field: str = "Policy_no",
) -> List[Difference]:
    """Compare two CSV files and return a list of differences."""
    rows_a = read_csv_sorted(file_path_a, key_field)
    rows_b = read_csv_sorted(file_path_b, key_field)

    duplicates_a = detect_duplicate_keys(rows_a, key_field)
    duplicates_b = detect_duplicate_keys(rows_b, key_field)
    if duplicates_a or duplicates_b:
        duplicates_info = []
        if duplicates_a:
            duplicates_info.append(
                f"Файл {os.path.basename(file_path_a)} содержит дубликаты ключей: {', '.join(duplicates_a)}"
            )
        if duplicates_b:
            duplicates_info.append(
                f"Файл {os.path.basename(file_path_b)} содержит дубликаты ключей: {', '.join(duplicates_b)}"
            )
        raise CsvComparisonError("\n".join(duplicates_info))

    lookup_a = {row[key_field]: row for row in rows_a}
    lookup_b = {row[key_field]: row for row in rows_b}

    all_keys = sorted(set(lookup_a) | set(lookup_b))
    def collect_columns(rows: Sequence[Dict[str, str]]) -> Set[str]:
        columns: Set[str] = set()
        for row in rows:
            columns.update(row.keys())
        return columns

    columns_a = collect_columns(rows_a)
    columns_b = collect_columns(rows_b)
    all_columns = list(sorted(columns_a | columns_b))

    differences: List[Difference] = []
    for key in all_keys:
        row_a = lookup_a.get(key)
        row_b = lookup_b.get(key)
        if row_a is None:
            differences.append(
                Difference(
                    policy_no=key,
                    column="__missing__",
                    value_a="—",
                    value_b=f"Строка отсутствует в {os.path.basename(file_path_a)}",
                )
            )
            continue
        if row_b is None:
            differences.append(
                Difference(
                    policy_no=key,
                    column="__missing__",
                    value_a=f"Строка отсутствует в {os.path.basename(file_path_b)}",
                    value_b="—",
                )
            )
            continue

        for column in all_columns:
            if column == key_field:
                continue
            value_a = row_a.get(column, "") or ""
            value_b = row_b.get(column, "") or ""
            if value_a != value_b:
                differences.append(
                    Difference(
                        policy_no=key,
                        column=column,
                        value_a=value_a,
                        value_b=value_b,
                    )
                )

    return differences


class CsvComparatorApp(tk.Tk):
    """Tkinter based GUI application for comparing CSV files."""

    def __init__(self) -> None:
        super().__init__()
        self.title("Сравнение CSV по Policy_no")
        self.geometry("900x600")
        self.minsize(700, 500)

        self.file_path_a = tk.StringVar()
        self.file_path_b = tk.StringVar()
        self.key_field = tk.StringVar(value="Policy_no")

        self._build_ui()

    def _build_ui(self) -> None:
        """Construct the widgets for the application."""
        main_frame = ttk.Frame(self, padding=10)
        main_frame.pack(fill=tk.BOTH, expand=True)

        file_frame = ttk.Frame(main_frame)
        file_frame.pack(fill=tk.X, pady=(0, 10))

        self._add_file_selector(file_frame, "Файл 1", self.file_path_a, 0)
        self._add_file_selector(file_frame, "Файл 2", self.file_path_b, 1)

        key_frame = ttk.Frame(main_frame)
        key_frame.pack(fill=tk.X, pady=(0, 10))

        ttk.Label(key_frame, text="Ключевой столбец:").pack(side=tk.LEFT)
        ttk.Entry(key_frame, textvariable=self.key_field, width=30).pack(
            side=tk.LEFT, padx=(5, 0)
        )

        ttk.Button(
            key_frame,
            text="Сравнить",
            command=self.compare_and_display,
        ).pack(side=tk.RIGHT)

        columns = ("policy_no", "column", "value_a", "value_b")
        self.tree = ttk.Treeview(
            main_frame,
            columns=columns,
            show="headings",
        )
        self.headings = {
            "policy_no": "Policy_no",
            "column": "Поле",
            "value_a": "Значение файла 1",
            "value_b": "Значение файла 2",
        }
        for column in columns:
            self.tree.heading(column, text=self.headings[column])
            self.tree.column(column, anchor=tk.W, stretch=True)

        scrollbar = ttk.Scrollbar(
            main_frame, orient=tk.VERTICAL, command=self.tree.yview
        )
        self.tree.configure(yscrollcommand=scrollbar.set)

        self.tree.pack(fill=tk.BOTH, expand=True, side=tk.LEFT)
        scrollbar.pack(fill=tk.Y, side=tk.RIGHT)

        self.status_label = ttk.Label(main_frame, text="")
        self.status_label.pack(fill=tk.X, pady=(10, 0))

    def _add_file_selector(
        self,
        parent: ttk.Frame,
        label_text: str,
        variable: tk.StringVar,
        row: int,
    ) -> None:
        """Add labeled entry with a button to choose a file."""
        row_frame = ttk.Frame(parent)
        row_frame.grid(row=row, column=0, sticky=tk.W + tk.E, pady=5)
        row_frame.columnconfigure(1, weight=1)

        ttk.Label(row_frame, text=label_text, width=12).grid(row=0, column=0, sticky=tk.W)
        entry = ttk.Entry(row_frame, textvariable=variable)
        entry.grid(row=0, column=1, sticky=tk.W + tk.E, padx=(5, 5))
        ttk.Button(
            row_frame,
            text="Выбрать...",
            command=lambda: self._select_file(variable),
        ).grid(row=0, column=2, sticky=tk.E)

    def _select_file(self, variable: tk.StringVar) -> None:
        """Open a file dialog and update the variable with the chosen path."""
        file_path = filedialog.askopenfilename(
            title="Выбор CSV файла",
            filetypes=(("CSV файлы", "*.csv"), ("Все файлы", "*.*")),
        )
        if file_path:
            variable.set(file_path)

    def compare_and_display(self) -> None:
        """Run comparison and display results in the treeview."""
        file_a = self.file_path_a.get().strip()
        file_b = self.file_path_b.get().strip()
        key_field = self.key_field.get().strip()

        if not file_a or not file_b:
            messagebox.showwarning("Внимание", "Укажите пути к обоим файлам.")
            return
        if not key_field:
            messagebox.showwarning("Внимание", "Укажите ключевой столбец.")
            return

        try:
            differences = compare_csv_files(file_a, file_b, key_field)
        except CsvComparisonError as error:
            messagebox.showerror("Ошибка", str(error))
            return
        except Exception as error:  # pragma: no cover - защитный блок
            messagebox.showerror("Ошибка", f"Непредвиденная ошибка: {error}")
            return

        self._populate_tree(differences, os.path.basename(file_a), os.path.basename(file_b))

    def _populate_tree(
        self,
        differences: Sequence[Difference],
        file_name_a: str,
        file_name_b: str,
    ) -> None:
        """Fill the treeview with comparison results."""
        for item in self.tree.get_children():
            self.tree.delete(item)

        if not differences:
            self.status_label.config(text="Различий не обнаружено.")
            self.tree.heading("value_a", text=self.headings["value_a"])
            self.tree.heading("value_b", text=self.headings["value_b"])
            return

        self.tree.heading("value_a", text=f"Значение {file_name_a}")
        self.tree.heading("value_b", text=f"Значение {file_name_b}")

        for diff in differences:
            column_label = (
                "Строка отсутствует" if diff.column == "__missing__" else diff.column
            )
            self.tree.insert(
                "",
                tk.END,
                values=(diff.policy_no, column_label, diff.value_a, diff.value_b),
            )

        self.status_label.config(
            text=(
                f"Обнаружено различий: {len(differences)}. "
                f"Источник 1: {file_name_a}. Источник 2: {file_name_b}."
            )
        )


def run_app() -> None:
    """Launch the GUI application."""
    app = CsvComparatorApp()
    app.mainloop()


if __name__ == "__main__":
    run_app()
