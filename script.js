const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const DEFAULT_KEY_HEADER = 'POLICY_NO';

const form = document.getElementById('compare-form');
const fileInputA = document.getElementById('fileA');
const fileInputB = document.getElementById('fileB');
const keyFieldInput = document.getElementById('keyField');
const keyHeader = document.getElementById('key-header');
const tableBody = document.querySelector('#results-table tbody');
const valueHeaderA = document.getElementById('value-header-a');
const valueHeaderB = document.getElementById('value-header-b');
const summaryBlock = document.getElementById('summary');
const errorBlock = document.getElementById('form-error');
const downloadReportButton = document.getElementById('download-report');
const downloadDetailedReportButton = document.getElementById('download-detailed-report');
const loadingIndicator = document.getElementById('loading-indicator');

let lastDifferences = [];
let lastFileNameA = '';
let lastFileNameB = '';
let lastKeyFieldName = '';

function validateFormInput(fileA, fileB, keyField) {
    if (!fileA || !fileB) {
        throw new Error('Пожалуйста, выберите оба файла для сравнения.');
    }
    if (!keyField) {
        throw new Error('Укажите название ключевого столбца.');
    }
    [fileA, fileB].forEach((file) => {
        if (!isCsvFile(file)) {
            throw new Error(`Файл ${file.name} не похож на CSV. Загрузите файл с расширением .csv.`);
        }
        if (file.size === 0) {
            throw new Error(`Файл ${file.name} пуст и не может быть обработан.`);
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
            throw new Error(`Файл ${file.name} превышает допустимый размер 15 МБ.`);
        }
    });
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError();

    const fileA = fileInputA.files[0];
    const fileB = fileInputB.files[0];
    const keyField = keyFieldInput.value.trim();

    try {
        validateFormInput(fileA, fileB, keyField);
    } catch (validationError) {
        showError(validationError instanceof Error ? validationError.message : String(validationError));
        return;
    }

    downloadReportButton.disabled = true;
    downloadDetailedReportButton.disabled = true;
    showLoadingIndicator();

    try {
        const [datasetA, datasetB] = await Promise.all([
            readCsvFile(fileA),
            readCsvFile(fileB)
        ]);

        const result = compareDatasets(datasetA, datasetB, keyField, fileA.name, fileB.name);
        lastDifferences = result.differences;
        lastFileNameA = fileA.name;
        lastFileNameB = fileB.name;
        lastKeyFieldName = result.keyField;

        renderDifferences(result.differences, result.headers);
        renderSummary(result.summaryText);
        const hasDifferences = result.differences.length > 0;
        downloadReportButton.disabled = !hasDifferences;
        downloadDetailedReportButton.disabled = !hasDifferences;
    } catch (error) {
        console.error(error);
        resetTable();
        lastDifferences = [];
        lastFileNameA = '';
        lastFileNameB = '';
        lastKeyFieldName = '';
        downloadReportButton.disabled = true;
        downloadDetailedReportButton.disabled = true;
        renderSummary('');
        showError(error instanceof Error ? error.message : String(error));
    } finally {
        hideLoadingIndicator();
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

downloadDetailedReportButton.addEventListener('click', () => {
    if (!lastDifferences.length) {
        return;
    }
    try {
        const csvContent = buildDetailedReport(lastDifferences, lastFileNameA, lastFileNameB, lastKeyFieldName);
        triggerCsvDownload(csvContent, `csv-check-pro-detailed-${Date.now()}.csv`);
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
            dynamicTyping: false,
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
                const sanitizedRows = results.data.map((row) => {
                    const entries = Object.entries(row)
                        .map(([column, value]) => {
                            const trimmedColumn = column.trim();
                            if (!trimmedColumn) {
                                return null;
                            }
                            const normalizedValue = typeof value === 'string' ? value : String(value ?? '');
                            return [trimmedColumn, normalizedValue];
                        })
                        .filter(Boolean);
                    return Object.fromEntries(entries);
                });
                resolve({ rows: sanitizedRows });
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

    const keyFieldA = resolveKeyField(rowsA, keyField, nameA);
    const keyFieldB = resolveKeyField(rowsB, keyField, nameB);

    if (keyFieldA.toLowerCase() !== keyFieldB.toLowerCase()) {
        throw new Error(`Столбец "${keyField}" найден как "${keyFieldA}" в файле ${nameA} и как "${keyFieldB}" в файле ${nameB}. Убедитесь, что ключевой столбец совпадает.`);
    }

    validateKeysFilled(rowsA, keyFieldA, nameA);
    validateKeysFilled(rowsB, keyFieldB, nameB);

    const duplicatesA = detectDuplicateKeys(rowsA, keyFieldA);
    const duplicatesB = detectDuplicateKeys(rowsB, keyFieldB);

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

    const lookupA = buildLookup(rowsA, keyFieldA);
    const lookupB = buildLookup(rowsB, keyFieldB);
    const allKeys = Array.from(new Set([...Object.keys(lookupA), ...Object.keys(lookupB)])).sort();

    const columnsA = collectColumns(rowsA);
    const columnsB = collectColumns(rowsB);
    const allColumns = Array.from(new Set([...columnsA, ...columnsB])).sort();
    const keyColumns = new Set([keyFieldA, keyFieldB]);

    const differences = [];
    for (const key of allKeys) {
        const rowA = lookupA[key];
        const rowB = lookupB[key];

        if (!rowA) {
            differences.push({
                keyValue: key,
                column: '__missing__',
                value_a: `Нет записи в ${nameA}`,
                value_b: buildRowPreview(rowB, allColumns, keyColumns) || '—',
                difference_type: 'missing_in_a'
            });
            continue;
        }
        if (!rowB) {
            differences.push({
                keyValue: key,
                column: '__missing__',
                value_a: buildRowPreview(rowA, allColumns, keyColumns) || '—',
                value_b: `Нет записи в ${nameB}`,
                difference_type: 'missing_in_b'
            });
            continue;
        }

        for (const column of allColumns) {
            if (keyColumns.has(column)) {
                continue;
            }
            const valueA = (rowA[column] ?? '').trim();
            const valueB = (rowB[column] ?? '').trim();
            if (valueA !== valueB) {
                differences.push({
                    keyValue: key,
                    column,
                    value_a: valueA,
                    value_b: valueB,
                    difference_type: 'value_mismatch'
                });
            }
        }
    }

    const summaryText = buildSummary(differences, nameA, nameB, keyFieldA);
    return {
        differences,
        headers: {
            key: keyFieldA,
            valueA: `Значение ${nameA}`,
            valueB: `Значение ${nameB}`
        },
        summaryText,
        keyField: keyFieldA
    };
}

/**
 * Найти реальное имя ключевого столбца с учётом регистра.
 * @param {Array<Record<string, string>>} rows
 * @param {string} requestedKey
 * @param {string} fileName
 */
function resolveKeyField(rows, requestedKey, fileName) {
    if (!rows.length) {
        throw new Error(`Файл ${fileName} не содержит данных.`);
    }
    const columns = Object.keys(rows[0]);
    if (columns.includes(requestedKey)) {
        return requestedKey;
    }
    const loweredKey = requestedKey.toLowerCase();
    const matchedColumn = columns.find((column) => column.toLowerCase() === loweredKey);
    if (matchedColumn) {
        return matchedColumn;
    }
    throw new Error(`В файле ${fileName} отсутствует столбец "${requestedKey}". Доступные поля: ${columns.join(', ')}.`);
}

function validateKeysFilled(rows, keyField, fileName) {
    const emptyRows = [];
    rows.forEach((row, index) => {
        const normalizedKey = normalizeKeyValue(row[keyField]);
        if (!normalizedKey) {
            emptyRows.push(index + 1);
        }
    });
    if (emptyRows.length) {
        throw new Error(`В файле ${fileName} обнаружены строки без значения в столбце "${keyField}" (например, строки: ${emptyRows.slice(0, 5).join(', ')}).`);
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
        Object.keys(row).forEach((key) => {
            const trimmedKey = key.trim();
            if (trimmedKey) {
                columns.add(trimmedKey);
            }
        });
    }
    return columns;
}

/**
 * Создать словарь строк по ключевому столбцу.
 * @param {Array<Record<string, string>>} rows
 * @param {string} keyField
 */
function buildLookup(rows, keyField) {
    const map = Object.create(null);
    for (const row of rows) {
        const key = normalizeKeyValue(row[keyField]);
        if (key) {
            map[key] = row;
        }
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
        const key = normalizeKeyValue(row[keyField]);
        const count = (seen.get(key) ?? 0) + 1;
        seen.set(key, count);
        if (count > 1) {
            duplicates.add(key);
        }
    }
    return Array.from(duplicates).filter(Boolean).sort();
}

/**
 * Сформировать короткое описание строки.
 * @param {Record<string, string>} row
 * @param {string[]} columns
 * @param {Set<string>} keyColumns
 */
function buildRowPreview(row, columns, keyColumns) {
    if (!row) {
        return '';
    }
    const parts = [];
    for (const column of columns) {
        if (keyColumns.has(column)) {
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
function buildSummary(differences, nameA, nameB, keyField) {
    if (!differences.length) {
        return `Различий не обнаружено. Файл 1: ${nameA}. Файл 2: ${nameB}. Ключ: ${keyField}.`;
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
    return `Всего различий: ${differences.length}. Файл 1: ${nameA}. Файл 2: ${nameB}. Ключ: ${keyField}.${detailsText}`;
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
 * Построить подробный CSV-отчёт, повторяющий таблицу различий.
 * @param {Array<Record<string, string>>} differences
 * @param {string} nameA
 * @param {string} nameB
 * @param {string} keyField
 */
function buildDetailedReport(differences, nameA, nameB, keyField) {
    if (!differences.length) {
        throw new Error('Отчёт нельзя сохранить: различия отсутствуют.');
    }

    const effectiveKeyField = keyField || DEFAULT_KEY_HEADER;

    const headers = [
        effectiveKeyField,
        'Поле',
        'Тип различия',
        `Значение ${nameA}`,
        `Значение ${nameB}`
    ];
    const rows = [headers.map(escapeCsvValue).join(',')];

    for (const diff of differences) {
        const fieldName = diff.column === '__missing__' ? 'Строка отсутствует' : diff.column;
        const typeLabel = labelForDifference(diff.difference_type);
        const valueA = diff.value_a || '—';
        const valueB = diff.value_b || '—';
        const row = [
            escapeCsvValue(diff.keyValue),
            escapeCsvValue(fieldName),
            escapeCsvValue(typeLabel),
            escapeCsvValue(valueA),
            escapeCsvValue(valueB)
        ].join(',');
        rows.push(row);
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
    const safeFilename = filename.replace(/[^\w.\-]+/g, '_');
    link.setAttribute('download', safeFilename);
    link.rel = 'noopener';
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
    keyHeader.textContent = headers.key || DEFAULT_KEY_HEADER;
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

    const fragment = document.createDocumentFragment();
    for (const diff of differences) {
        const row = document.createElement('tr');
        row.classList.add('result');
        const rowClass = classForDifference(diff.difference_type);
        if (rowClass) {
            row.classList.add(rowClass);
        }

        const policyCell = document.createElement('td');
        policyCell.textContent = diff.keyValue;
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

        fragment.appendChild(row);
    }
    tableBody.appendChild(fragment);
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
    keyHeader.textContent = lastKeyFieldName || DEFAULT_KEY_HEADER;
    valueHeaderA.textContent = 'Значение файла 1';
    valueHeaderB.textContent = 'Значение файла 2';
}

function showError(message) {
    errorBlock.hidden = false;
    errorBlock.textContent = message;
}

function hideError() {
    errorBlock.hidden = true;
    errorBlock.textContent = '';
}

function showLoadingIndicator() {
    loadingIndicator.hidden = false;
    loadingIndicator.setAttribute('aria-busy', 'true');
}

function hideLoadingIndicator() {
    loadingIndicator.hidden = true;
    loadingIndicator.removeAttribute('aria-busy');
}

function normalizeKeyValue(value) {
    return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

function isCsvFile(file) {
    const name = file.name.toLowerCase();
    if (name.endsWith('.csv')) {
        return true;
    }
    return ['text/csv', 'application/vnd.ms-excel'].includes(file.type);
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
