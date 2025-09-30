const form = document.getElementById('compare-form');
const fileInputA = document.getElementById('fileA');
const fileInputB = document.getElementById('fileB');
const keyFieldInput = document.getElementById('keyField');
const tableBody = document.querySelector('#results-table tbody');
const valueHeaderA = document.getElementById('value-header-a');
const valueHeaderB = document.getElementById('value-header-b');
const summaryBlock = document.getElementById('summary');
const errorBlock = document.getElementById('form-error');
const downloadReportButton = document.getElementById('download-report');

let lastDifferences = [];
let lastFileNameA = '';
let lastFileNameB = '';

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError();

    const fileA = fileInputA.files[0];
    const fileB = fileInputB.files[0];
    const keyField = keyFieldInput.value.trim();

    if (!fileA || !fileB) {
        showError('Пожалуйста, выберите оба файла для сравнения.');
        return;
    }
    if (!keyField) {
        showError('Укажите название ключевого столбца.');
        return;
    }

    try {
        const [datasetA, datasetB] = await Promise.all([
            readCsvFile(fileA),
            readCsvFile(fileB)
        ]);

        const result = compareDatasets(datasetA, datasetB, keyField, fileA.name, fileB.name);
        lastDifferences = result.differences;
        lastFileNameA = fileA.name;
        lastFileNameB = fileB.name;

        renderDifferences(result.differences, result.headers);
        renderSummary(result.summaryText);
        downloadReportButton.disabled = result.differences.length === 0;
    } catch (error) {
        console.error(error);
        resetTable();
        lastDifferences = [];
        downloadReportButton.disabled = true;
        renderSummary('');
        showError(error instanceof Error ? error.message : String(error));
    }
});

downloadReportButton.addEventListener('click', () => {
    if (!lastDifferences.length) {
        return;
    }
    try {
        const csvContent = buildAggregatedReport(lastDifferences);
        triggerCsvDownload(csvContent, `csv-check-pro-report-${Date.now()}.csv`);
    } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
    }
});

/**
 * Прочитать CSV-файл и вернуть массив объектов.
 * @param {File} file
 * @returns {Promise<{ rows: Array<Record<string, string>> }>} parsed data
 */
function readCsvFile(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            encoding: 'utf-8',
            error: (error) => reject(new Error(`Не удалось прочитать файл ${file.name}: ${error.message}`)),
            complete: (results) => {
                if (results.errors && results.errors.length > 0) {
                    const firstError = results.errors[0];
                    reject(new Error(`Ошибка разбора CSV ${file.name}: ${firstError.message}`));
                    return;
                }
                if (!Array.isArray(results.data)) {
                    reject(new Error(`Файл ${file.name} не содержит корректных данных.`));
                    return;
                }
                resolve({ rows: results.data });
            }
        });
    });
}

/**
 * Сравнить два набора данных из CSV-файлов.
 * @param {{rows: Array<Record<string, string>>}} datasetA
 * @param {{rows: Array<Record<string, string>>}} datasetB
 * @param {string} keyField
 * @param {string} nameA
 * @param {string} nameB
 */
function compareDatasets(datasetA, datasetB, keyField, nameA, nameB) {
    const rowsA = datasetA.rows;
    const rowsB = datasetB.rows;

    validateKeyPresence(rowsA, keyField, nameA);
    validateKeyPresence(rowsB, keyField, nameB);

    const duplicatesA = detectDuplicateKeys(rowsA, keyField);
    const duplicatesB = detectDuplicateKeys(rowsB, keyField);

    if (duplicatesA.length || duplicatesB.length) {
        const details = [];
        if (duplicatesA.length) {
            details.push(`Файл ${nameA} содержит дубликаты ключей: ${duplicatesA.join(', ')}`);
        }
        if (duplicatesB.length) {
            details.push(`Файл ${nameB} содержит дубликаты ключей: ${duplicatesB.join(', ')}`);
        }
        throw new Error(details.join('\n'));
    }

    const lookupA = buildLookup(rowsA, keyField);
    const lookupB = buildLookup(rowsB, keyField);
    const allKeys = Array.from(new Set([...Object.keys(lookupA), ...Object.keys(lookupB)])).sort();

    const columnsA = collectColumns(rowsA);
    const columnsB = collectColumns(rowsB);
    const allColumns = Array.from(new Set([...columnsA, ...columnsB])).sort();

    const differences = [];
    for (const key of allKeys) {
        const rowA = lookupA[key];
        const rowB = lookupB[key];

        if (!rowA) {
            differences.push({
                POLICY_NO: key,
                column: '__missing__',
                value_a: `Нет записи в ${nameA}`,
                value_b: buildRowPreview(rowB, allColumns, keyField) || '—',
                difference_type: 'missing_in_a'
            });
            continue;
        }
        if (!rowB) {
            differences.push({
                POLICY_NO: key,
                column: '__missing__',
                value_a: buildRowPreview(rowA, allColumns, keyField) || '—',
                value_b: `Нет записи в ${nameB}`,
                difference_type: 'missing_in_b'
            });
            continue;
        }

        for (const column of allColumns) {
            if (column === keyField) {
                continue;
            }
            const valueA = (rowA[column] ?? '').trim();
            const valueB = (rowB[column] ?? '').trim();
            if (valueA !== valueB) {
                differences.push({
                    POLICY_NO: key,
                    column,
                    value_a: valueA,
                    value_b: valueB,
                    difference_type: 'value_mismatch'
                });
            }
        }
    }

    const summaryText = buildSummary(differences, nameA, nameB);
    return {
        differences,
        headers: {
            valueA: `Значение ${nameA}`,
            valueB: `Значение ${nameB}`
        },
        summaryText
    };
}

/**
 * Убедиться, что ключевой столбец присутствует.
 * @param {Array<Record<string, string>>} rows
 * @param {string} keyField
 * @param {string} fileName
 */
function validateKeyPresence(rows, keyField, fileName) {
    if (!rows.length) {
        throw new Error(`Файл ${fileName} не содержит данных.`);
    }
    const firstRow = rows[0];
    if (!(keyField in firstRow)) {
        throw new Error(`В файле ${fileName} отсутствует столбец "${keyField}".`);
    }
}

/**
 * Собрать множество столбцов.
 * @param {Array<Record<string, string>>} rows
 * @returns {Set<string>}
 */
function collectColumns(rows) {
    const columns = new Set();
    for (const row of rows) {
        Object.keys(row).forEach((key) => columns.add(key));
    }
    return columns;
}

/**
 * Создать словарь строк по ключевому столбцу.
 * @param {Array<Record<string, string>>} rows
 * @param {string} keyField
 */
function buildLookup(rows, keyField) {
    const map = {};
    for (const row of rows) {
        map[row[keyField]] = row;
    }
    return map;
}

/**
 * Найти дубликаты ключей.
 * @param {Array<Record<string, string>>} rows
 * @param {string} keyField
 * @returns {string[]}
 */
function detectDuplicateKeys(rows, keyField) {
    const seen = new Map();
    const duplicates = new Set();
    for (const row of rows) {
        const key = (row[keyField] ?? '').trim();
        const count = (seen.get(key) ?? 0) + 1;
        seen.set(key, count);
        if (count > 1) {
            duplicates.add(key || '');
        }
    }
    return Array.from(duplicates).sort();
}

/**
 * Сформировать короткое описание строки.
 * @param {Record<string, string>} row
 * @param {string[]} columns
 * @param {string} keyField
 */
function buildRowPreview(row, columns, keyField) {
    if (!row) {
        return '';
    }
    const parts = [];
    for (const column of columns) {
        if (column === keyField) {
            continue;
        }
        const value = (row[column] ?? '').trim();
        if (value) {
            parts.push(`${column}=${value}`);
        }
    }
    return parts.join(', ');
}

/**
 * Построить текстовую сводку различий.
 * @param {Array<Record<string, string>>} differences
 * @param {string} nameA
 * @param {string} nameB
 */
function buildSummary(differences, nameA, nameB) {
    if (!differences.length) {
        return `Различий не обнаружено. Файл 1: ${nameA}. Файл 2: ${nameB}.`;
    }
    const counts = differences.reduce((acc, diff) => {
        acc[diff.difference_type] = (acc[diff.difference_type] ?? 0) + 1;
        return acc;
    }, {});
    const details = [];
    if (counts['value_mismatch']) {
        details.push(`несовпадений значений — ${counts['value_mismatch']}`);
    }
    if (counts['missing_in_a']) {
        details.push(`нет строк в файле 1 — ${counts['missing_in_a']}`);
    }
    if (counts['missing_in_b']) {
        details.push(`нет строк в файле 2 — ${counts['missing_in_b']}`);
    }
    const detailsText = details.length ? ` Детализация: ${details.join('; ')}.` : '';
    return `Всего различий: ${differences.length}. Файл 1: ${nameA}. Файл 2: ${nameB}.${detailsText}`;
}

/**
 * Построить CSV-отчёт по полям.
 * @param {Array<Record<string, string>>} differences
 */
function buildAggregatedReport(differences) {
    if (!differences.length) {
        throw new Error('Отчёт нельзя сохранить: различия отсутствуют.');
    }
    const counter = new Map();
    for (const diff of differences) {
        const fieldName = diff.column === '__missing__' ? 'Строка отсутствует' : diff.column;
        const current = counter.get(fieldName) ?? { total: 0, mismatch: 0, missingA: 0, missingB: 0 };
        current.total += 1;
        if (diff.difference_type === 'value_mismatch') {
            current.mismatch += 1;
        } else if (diff.difference_type === 'missing_in_a') {
            current.missingA += 1;
        } else if (diff.difference_type === 'missing_in_b') {
            current.missingB += 1;
        }
        counter.set(fieldName, current);
    }
    const headers = ['Поле', 'Всего расхождений', 'Несовпадений значений', 'Отсутствует в файле 1', 'Отсутствует в файле 2'];
    const rows = [headers.join(',')];
    const sortedFields = Array.from(counter.keys()).sort();
    for (const field of sortedFields) {
        const { total, mismatch, missingA, missingB } = counter.get(field);
        rows.push([
            escapeCsvValue(field),
            total,
            mismatch,
            missingA,
            missingB
        ].join(','));
    }
    return rows.join('\r\n');
}

/**
 * Экранировать значение для CSV.
 * @param {string|number} value
 */
function escapeCsvValue(value) {
    const stringValue = String(value ?? '');
    if (/[",\n]/.test(stringValue)) {
        return `"${stringValue.replace(/"/g, '""')}"`;
    }
    return stringValue;
}

/**
 * Скачать CSV-файл через создание временной ссылки.
 * @param {string} content
 * @param {string} filename
 */
function triggerCsvDownload(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Показать результаты сравнения в таблице.
 * @param {Array<Record<string, string>>} differences
 * @param {{valueA: string, valueB: string}} headers
 */
function renderDifferences(differences, headers) {
    tableBody.innerHTML = '';
    valueHeaderA.textContent = headers.valueA;
    valueHeaderB.textContent = headers.valueB;

    if (!differences.length) {
        const row = document.createElement('tr');
        row.classList.add('empty-state');
        const cell = document.createElement('td');
        cell.colSpan = 5;
        cell.textContent = 'Различий не обнаружено.';
        row.appendChild(cell);
        tableBody.appendChild(row);
        return;
    }

    for (const diff of differences) {
        const row = document.createElement('tr');
        row.classList.add(classForDifference(diff.difference_type));

        const policyCell = document.createElement('td');
        policyCell.textContent = diff.POLICY_NO;
        row.appendChild(policyCell);

        const columnCell = document.createElement('td');
        columnCell.textContent = diff.column === '__missing__' ? 'Строка отсутствует' : diff.column;
        row.appendChild(columnCell);

        const typeCell = document.createElement('td');
        typeCell.textContent = labelForDifference(diff.difference_type);
        row.appendChild(typeCell);

        const valueACell = document.createElement('td');
        valueACell.textContent = diff.value_a || '—';
        row.appendChild(valueACell);

        const valueBCell = document.createElement('td');
        valueBCell.textContent = diff.value_b || '—';
        row.appendChild(valueBCell);

        tableBody.appendChild(row);
    }
}

/**
 * Получить CSS-класс по типу различия.
 * @param {string} differenceType
 */
function classForDifference(differenceType) {
    if (differenceType === 'value_mismatch') {
        return 'result--mismatch';
    }
    if (differenceType === 'missing_in_a') {
        return 'result--missing-a';
    }
    if (differenceType === 'missing_in_b') {
        return 'result--missing-b';
    }
    return '';
}

/**
 * Получить текстовую метку различия.
 * @param {string} differenceType
 */
function labelForDifference(differenceType) {
    if (differenceType === 'value_mismatch') {
        return 'Несовпадение значений';
    }
    if (differenceType === 'missing_in_a') {
        return 'Нет строки в файле 1';
    }
    if (differenceType === 'missing_in_b') {
        return 'Нет строки в файле 2';
    }
    return 'Различие';
}

function renderSummary(text) {
    if (!text) {
        summaryBlock.hidden = true;
        summaryBlock.textContent = '';
        return;
    }
    summaryBlock.hidden = false;
    summaryBlock.textContent = text;
}

function resetTable() {
    tableBody.innerHTML = '';
    const row = document.createElement('tr');
    row.classList.add('empty-state');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = 'Загрузите файлы и нажмите «Сравнить», чтобы увидеть различия.';
    row.appendChild(cell);
    tableBody.appendChild(row);
}

function showError(message) {
    errorBlock.hidden = false;
    errorBlock.textContent = message;
}

function hideError() {
    errorBlock.hidden = true;
    errorBlock.textContent = '';
}

// Пример использования функций сравнения в изолированном режиме (для тестирования в консоли браузера).
// runQuickCheck();
function runQuickCheck() {
    const datasetA = { rows: [
        { POLICY_NO: '1', Amount: '100', Status: 'Active' },
        { POLICY_NO: '2', Amount: '150', Status: 'Pending' }
    ] };
    const datasetB = { rows: [
        { POLICY_NO: '1', Amount: '120', Status: 'Active' },
        { POLICY_NO: '3', Amount: '200', Status: 'Closed' }
    ] };
    console.log(compareDatasets(datasetA, datasetB, 'POLICY_NO', 'A.csv', 'B.csv'));
}
