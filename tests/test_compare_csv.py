import csv
import os
import tempfile
import unittest

from csv_checker import compare_csv_files, CsvComparisonError


class CompareCsvFilesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_files = []

    def tearDown(self) -> None:
        for file_path in self.temp_files:
            if os.path.exists(file_path):
                os.remove(file_path)

    def _create_csv(self, headers, rows):
        temp_file = tempfile.NamedTemporaryFile("w", delete=False, newline="", encoding="utf-8")
        writer = csv.writer(temp_file)
        writer.writerow(headers)
        writer.writerows(rows)
        temp_file.close()
        self.temp_files.append(temp_file.name)
        return temp_file.name

    def test_detects_value_differences(self):
        headers = ["Policy_no", "Amount", "Status"]
        file_a = self._create_csv(headers, [["001", "100", "Active"], ["002", "200", "Active"]])
        file_b = self._create_csv(headers, [["001", "150", "Active"], ["002", "200", "Closed"]])

        differences = compare_csv_files(file_a, file_b)
        self.assertEqual(len(differences), 2)

        diff_columns = {(d.policy_no, d.column) for d in differences}
        self.assertIn(("001", "Amount"), diff_columns)
        self.assertIn(("002", "Status"), diff_columns)

    def test_detects_missing_rows(self):
        headers = ["Policy_no", "Amount"]
        file_a = self._create_csv(headers, [["001", "100"]])
        file_b = self._create_csv(headers, [["001", "100"], ["002", "200"]])

        differences = compare_csv_files(file_a, file_b)
        self.assertEqual(len(differences), 1)
        self.assertEqual(differences[0].policy_no, "002")
        self.assertEqual(differences[0].column, "__missing__")

    def test_raises_on_duplicate_keys(self):
        headers = ["Policy_no", "Amount"]
        file_a = self._create_csv(headers, [["001", "100"], ["001", "150"]])
        file_b = self._create_csv(headers, [["001", "100"]])

        with self.assertRaises(CsvComparisonError):
            compare_csv_files(file_a, file_b)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
