const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024; // 1 ГБ
const DEFAULT_KEY_HEADER = 'POLICY_NO';
const TABLE_FORMATS = {
    csv: { label: 'CSV (.csv)', extensions: ['.csv'], accept: '.csv', reader: readDelimitedFile },
    txt: { label: 'Текстовый (.txt)', extensions: ['.txt'], accept: '.txt', reader: readDelimitedFile },
    xlsx: { label: 'Excel (.xlsx)', extensions: ['.xlsx'], accept: '.xlsx', reader: readExcelFile },
    xls: { label: 'Excel 97-2003 (.xls)', extensions: ['.xls'], accept: '.xls', reader: readExcelFile }
};
const REPORT_FORMATS = {
    xlsx: {
        extension: 'xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    },
    csv: {
        extension: 'csv',
        mimeType: 'text/csv;charset=utf-8;'
    },
    txt: {
        extension: 'txt',
        mimeType: 'text/plain;charset=utf-8;'
    }
};
const DEFAULT_REPORT_FORMAT = 'xlsx';

const LAST_SCENE_STORAGE_KEY = 'csv-check-pro:last-cat-scene';

const CAT_SCENES = [
    {
        id: 'keyboard-yawn',
        ariaLabel: 'Глянцевый чёрный кот зевает и растянулся на клавиатуре.',
        image: 'assets/pixel_cat/cat_01_keyboard_yawn.svg',
        message: 'Лиза выгрузила новый датасет, Руслан чинит код, а я проверяю, чтобы клавиатура оставалась тёплой.',
        positionClass: 'cat-mascot--top-right cat-mascot--mirrored'
    },
    {
        id: 'keyboard-guard',
        ariaLabel: 'Чёрный кот охраняет тёплую клавиатуру и довольно мурчит.',
        image: 'assets/pixel_cat/cat_02_keyboard_warm.svg',
        message: 'Клавиши нагрел, отчёт проверил, жду награду за бдительность.',
        positionClass: 'cat-mascot--middle-left'
    },
    {
        id: 'coffee-hug',
        ariaLabel: 'Чёрный кот обнимает кружку с кофе и греет лапы.',
        image: 'assets/pixel_cat/cat_03_hug_mug.svg',
        message: 'Руслан бодрит себя кофе, Лиза — свежим отчётом, а я согреваюсь об кружку и жду апдейтов.',
        positionClass: 'cat-mascot--middle-right'
    },
    {
        id: 'empty-bowl',
        ariaLabel: 'Чёрный кот внимательно смотрит на пустую миску и ждёт пополнения.',
        image: 'assets/pixel_cat/cat_04_empty_bowl.svg',
        message: 'Проверка данных идёт полным ходом, а миска по-прежнему пуста. Кажется, пора напоминать команде о важном.',
        positionClass: 'cat-mascot--bottom-left'
    },
    {
        id: 'blanket-cozy',
        ariaLabel: 'Чёрный кот уютно укутался в плед.',
        image: 'assets/pixel_cat/cat_05_cozy_blanket.svg',
        message: 'Лиза строит дашборды, Руслан деплоит, а я тестирую новый плед на совместимость с ленивой жизнью.',
        positionClass: 'cat-mascot--bottom-right cat-mascot--mirrored'
    },
    {
        id: 'blanket-check',
        ariaLabel: 'Чёрный кот поднимает лапкой плед и проверяет мягкость.',
        image: 'assets/pixel_cat/cat_06_blanket_check.svg',
        message: 'Ревьюю покрытие: плед соответствует требованиям по уюту и безопасности релиза.',
        positionClass: 'cat-mascot--top-left'
    },
    {
        id: 'monitor-guard',
        ariaLabel: 'Чёрный кот строго охраняет монитор.',
        image: 'assets/pixel_cat/cat_07_stern_monitor.svg',
        message: 'Следующий, кто потревожит мой монитор, будет слушать лекцию о чистом коде от Руслана и о чистом датасете от Лизы.',
        positionClass: 'cat-mascot--top-right'
    },
    {
        id: 'warning-poster',
        ariaLabel: 'Чёрный кот охраняет плакат-предупреждение.',
        image: 'assets/pixel_cat/cat_08_strict_warning.svg',
        message: 'На стене список правил. Первое — не ломать прод. Второе — гладить кота. Третье — смотри пункт один.',
        positionClass: 'cat-mascot--middle-left cat-mascot--mirrored'
    },
    {
        id: 'yarn-play',
        ariaLabel: 'Чёрный кот играет с клубком пряжи.',
        image: 'assets/pixel_cat/cat_09_play_yarn.svg',
        message: 'Лиза ловит аномалии в данных, Руслан — баги в коде, а я ловлю клубок и прячу его в продакшене.',
        positionClass: 'cat-mascot--middle-right cat-mascot--mirrored'
    },
    {
        id: 'yarn-hide',
        ariaLabel: 'Чёрный кот прячет клубок в коробке и хитро улыбается.',
        image: 'assets/pixel_cat/cat_10_hide_yarn_prod.svg',
        message: 'Клубок успешно замаскирован под релизную коробку. Спрятано на ветке production, не говорите менеджеру.',
        positionClass: 'cat-mascot--bottom-right'
    }
];

const form = document.getElementById('compare-form');
const fileInputA = document.getElementById('fileA');
const fileInputB = document.getElementById('fileB');
const tableFormatSelect = document.getElementById('tableFormat');
const reportFormatSelect = document.getElementById('reportFormat');
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

initializeFormatHandling();
initializeCatMascot();

function validateFormInput(fileA, fileB, keyField, format) {
    const formatConfig = TABLE_FORMATS[format];
    if (!formatConfig) {
        throw new Error('Выбран неподдерживаемый формат файлов.');
    }
    if (!fileA || !fileB) {
        throw new Error('Пожалуйста, выберите оба файла для сравнения.');
    }
    if (!keyField) {
        throw new Error('Укажите название ключевого столбца.');
    }
    [fileA, fileB].forEach((file) => {
        if (!isFileOfFormat(file, formatConfig)) {
            throw new Error(`Файл ${file.name} не соответствует выбранному формату (${formatConfig.label}).`);
        }
        if (file.size === 0) {
            throw new Error(`Файл ${file.name} пуст и не может быть обработан.`);
        }
        if (file.size > MAX_FILE_SIZE_BYTES) {
            throw new Error(`Файл ${file.name} превышает допустимый размер 1 ГБ.`);
        }
    });
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideError();

    const fileA = fileInputA.files[0];
    const fileB = fileInputB.files[0];
    const keyField = keyFieldInput.value.trim();
    const format = tableFormatSelect.value;

    try {
        validateFormInput(fileA, fileB, keyField, format);
    } catch (validationError) {
        showError(validationError instanceof Error ? validationError.message : String(validationError));
        return;
    }

    downloadReportButton.disabled = true;
    downloadDetailedReportButton.disabled = true;
    showLoadingIndicator();

    try {
        const [datasetA, datasetB] = await Promise.all([
            readTableFile(fileA, format),
            readTableFile(fileB, format)
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
        handleReportDownload('aggregated');
    } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
    }
});

downloadDetailedReportButton.addEventListener('click', () => {
    if (!lastDifferences.length) {
        return;
    }
    try {
        handleReportDownload('detailed');
    } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
    }
});

/**
 * Обработать запрос на выгрузку отчёта в выбранном формате.
 * @param {'aggregated'|'detailed'} type
 */
function handleReportDownload(type) {
    const format = getSelectedReportFormat();
    const rows = type === 'aggregated'
        ? buildAggregatedReportData(lastDifferences)
        : buildDetailedReportData(lastDifferences, lastFileNameA, lastFileNameB, lastKeyFieldName);
    const timestamp = Date.now();
    const baseName = type === 'aggregated'
        ? `csv-check-pro-report-${timestamp}`
        : `csv-check-pro-detailed-${timestamp}`;
    const sheetName = type === 'aggregated' ? 'Сводный отчёт' : 'Подробный отчёт';
    triggerReportDownload(rows, format, baseName, sheetName);
}

/**
 * Получить выбранный пользователем формат отчёта.
 * @returns {'xlsx'|'csv'|'txt'}
 */
function getSelectedReportFormat() {
    const rawValue = reportFormatSelect?.value ?? DEFAULT_REPORT_FORMAT;
    if (REPORT_FORMATS[rawValue]) {
        return rawValue;
    }
    if (reportFormatSelect) {
        reportFormatSelect.value = DEFAULT_REPORT_FORMAT;
    }
    return DEFAULT_REPORT_FORMAT;
}

/**
 * Запустить скачивание отчёта в указанном формате.
 * @param {Array<Array<string>>} rows
 * @param {'xlsx'|'csv'|'txt'} format
 * @param {string} filenameBase
 * @param {string} sheetName
 */
function triggerReportDownload(rows, format, filenameBase, sheetName = 'Отчёт') {
    const formatConfig = REPORT_FORMATS[format] ?? REPORT_FORMATS[DEFAULT_REPORT_FORMAT];
    const safeBaseName = sanitizeFilename(filenameBase);

    if (format === 'xlsx') {
        downloadXlsxReport(rows, `${safeBaseName}.${formatConfig.extension}`, sheetName, formatConfig.mimeType);
        return;
    }

    if (format === 'csv') {
        const content = convertRowsToCsv(rows);
        triggerBlobDownload(content, formatConfig.mimeType, `${safeBaseName}.${formatConfig.extension}`);
        return;
    }

    if (format === 'txt') {
        const content = convertRowsToTxt(rows);
        triggerBlobDownload(content, formatConfig.mimeType, `${safeBaseName}.${formatConfig.extension}`);
        return;
    }

    const fallbackContent = convertRowsToCsv(rows);
    triggerBlobDownload(fallbackContent, REPORT_FORMATS.csv.mimeType, `${safeBaseName}.${REPORT_FORMATS.csv.extension}`);
}

/**
 * Скачать отчёт в формате XLSX.
 * @param {Array<Array<string>>} rows
 * @param {string} filename
 * @param {string} sheetName
 * @param {string} mimeType
 */
function downloadXlsxReport(rows, filename, sheetName, mimeType) {
    if (typeof XLSX === 'undefined') {
        throw new Error('Невозможно сформировать Excel-файл: библиотека XLSX не загружена. Обновите страницу и попробуйте снова.');
    }
    const safeSheetName = (sheetName || 'Отчёт').replace(/[\\/*?:\[\]]/g, ' ').trim().slice(0, 31) || 'Отчёт';
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName);
    const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    triggerBlobDownload(arrayBuffer, mimeType, filename);
}

/**
 * Преобразовать массив строк отчёта в CSV-представление.
 * @param {Array<Array<string>>} rows
 */
function convertRowsToCsv(rows) {
    // Пример: convertRowsToCsv([['Поле', 'Всего'], ['age', '3']]);
    return rows
        .map((row) => row.map((cell) => escapeCsvValue(cell ?? '')).join(','))
        .join('\r\n');
}

/**
 * Преобразовать массив строк отчёта в текстовое представление.
 * @param {Array<Array<string>>} rows
 */
function convertRowsToTxt(rows) {
    // Пример: convertRowsToTxt([['Поле', 'Всего'], ['age', '3']]);
    return rows
        .map((row) => row.map((cell) => sanitizeTextValue(cell)).join('\t'))
        .join('\r\n');
}

/**
 * Очистить значение текстовой ячейки от перевода строки.
 * @param {string} value
 */
function sanitizeTextValue(value) {
    const stringValue = String(value ?? '');
    return stringValue.replace(/[\r\n\t]+/g, ' ');
}

/**
 * Вспомогательная функция скачивания содержимого как файла.
 * @param {string|ArrayBuffer|Blob} data
 * @param {string} mimeType
 * @param {string} filename
 */
function triggerBlobDownload(data, mimeType, filename) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', sanitizeFilename(filename));
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Очистить имя файла для безопасного скачивания.
 * @param {string} filename
 */
function sanitizeFilename(filename) {
    const normalized = String(filename ?? 'report');
    return normalized.replace(/[^\w.\-]+/g, '_') || 'report';
}

/**
 * Прочитать табличный файл в зависимости от выбранного формата.
 * @param {File} file
 * @param {string} format
 * @returns {Promise<{ rows: Array<Record<string, string>> }>}
 */
function readTableFile(file, format) {
    const formatConfig = TABLE_FORMATS[format];
    if (!formatConfig) {
        return Promise.reject(new Error('Формат файлов не поддерживается.'));
    }
    return formatConfig.reader(file, formatConfig);
}

/**
 * Прочитать текстовый файл с разделителями и вернуть массив объектов.
 * @param {File} file
 * @returns {Promise<{ rows: Array<Record<string, string>> }>}
 */
function readDelimitedFile(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: 'greedy',
            encoding: 'utf-8',
            dynamicTyping: false,
            error: (error) => reject(new Error(`Не удалось прочитать файл ${file.name}: ${error.message}`)),
            complete: (results) => {
                if (results.errors && results.errors.length > 0) {
                    const firstError = results.errors[0];
                    reject(new Error(`Ошибка разбора файла ${file.name}: ${firstError.message}`));
                    return;
                }
                if (!Array.isArray(results.data)) {
                    reject(new Error(`Файл ${file.name} не содержит корректных данных.`));
                    return;
                }
                const sanitizedRows = sanitizeRows(results.data);
                resolve({ rows: sanitizedRows });
            }
        });
    });
}

/**
 * Прочитать файл Excel и вернуть массив объектов.
 * @param {File} file
 * @returns {Promise<{ rows: Array<Record<string, string>> }>}
 */
function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        if (typeof XLSX === 'undefined') {
            reject(new Error('Библиотека для чтения Excel не загружена. Обновите страницу и попробуйте снова.'));
            return;
        }
        const reader = new FileReader();
        reader.onerror = () => {
            reject(new Error(`Не удалось прочитать файл ${file.name}.`));
        };
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target?.result ?? []);
                const workbook = XLSX.read(data, { type: 'array' });
                if (!workbook.SheetNames.length) {
                    throw new Error('Книга Excel не содержит листов.');
                }
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });
                const sanitizedRows = sanitizeRows(rows);
                resolve({ rows: sanitizedRows });
            } catch (excelError) {
                const message = excelError instanceof Error ? excelError.message : String(excelError);
                reject(new Error(`Не удалось обработать Excel файл ${file.name}: ${message}`));
            }
        };
        reader.readAsArrayBuffer(file);
    });
}

function initializeCatMascot() {
    const root = document.getElementById('cat-mascot-root');
    if (!root || !CAT_SCENES.length) {
        return;
    }

    let availableScenes = CAT_SCENES;
    try {
        const previousSceneId = sessionStorage.getItem(LAST_SCENE_STORAGE_KEY);
        if (previousSceneId && CAT_SCENES.length > 1) {
            const filtered = CAT_SCENES.filter((scene) => scene.id !== previousSceneId);
            if (filtered.length) {
                availableScenes = filtered;
            }
        }
    } catch (storageError) {
        console.warn('Не удалось получить данные из sessionStorage:', storageError);
    }

    const sceneIndex = Math.floor(Math.random() * availableScenes.length);
    const scene = availableScenes[sceneIndex];

    try {
        sessionStorage.setItem(LAST_SCENE_STORAGE_KEY, scene.id);
    } catch (storageError) {
        console.warn('Не удалось сохранить данные в sessionStorage:', storageError);
    }

    const wrapper = document.createElement('div');
    wrapper.className = `cat-mascot ${scene.positionClass}`.trim();

    const imageContainer = document.createElement('div');
    imageContainer.className = 'cat-mascot__image';
    const imageElement = document.createElement('img');
    imageElement.src = scene.image;
    imageElement.alt = scene.ariaLabel;
    imageElement.loading = 'lazy';
    imageElement.decoding = 'async';
    imageElement.className = 'cat-mascot__illustration';
    imageContainer.append(imageElement);

    const bubble = document.createElement('div');
    bubble.className = 'cat-mascot__bubble';
    bubble.textContent = scene.message;

    wrapper.append(imageContainer, bubble);
    root.innerHTML = '';
    root.append(wrapper);
}

/**
 * Очистить и нормализовать строки данных.
 * @param {Array<Record<string, unknown>>} rows
 * @returns {Array<Record<string, string>>}
 */
function sanitizeRows(rows) {
    return rows
        .map((row) => {
            const source = row && typeof row === 'object' ? row : {};
            const entries = Object.entries(source)
                .map(([column, value]) => {
                    const trimmedColumn = typeof column === 'string' ? column.trim() : String(column ?? '').trim();
                    if (!trimmedColumn) {
                        return null;
                    }
                    const normalizedValue = typeof value === 'string' ? value : String(value ?? '');
                    return [trimmedColumn, normalizedValue];
                })
                .filter(Boolean);
            return Object.fromEntries(entries);
        })
        .filter((row) => Object.keys(row).length > 0);
}

function initializeFormatHandling() {
    if (!tableFormatSelect) {
        return;
    }
    updateFileInputsAccept(tableFormatSelect.value);
    tableFormatSelect.addEventListener('change', () => {
        updateFileInputsAccept(tableFormatSelect.value);
        clearFilesAfterFormatChange();
        hideError();
        lastDifferences = [];
        lastFileNameA = '';
        lastFileNameB = '';
        lastKeyFieldName = '';
        downloadReportButton.disabled = true;
        downloadDetailedReportButton.disabled = true;
        renderSummary('');
        resetTable();
    });
}

function updateFileInputsAccept(format) {
    const formatConfig = TABLE_FORMATS[format] ?? TABLE_FORMATS.csv;
    const acceptValue = Array.isArray(formatConfig.accept) ? formatConfig.accept.join(',') : formatConfig.accept;
    if (acceptValue) {
        fileInputA.setAttribute('accept', acceptValue);
        fileInputB.setAttribute('accept', acceptValue);
    } else {
        fileInputA.removeAttribute('accept');
        fileInputB.removeAttribute('accept');
    }
}

function clearFilesAfterFormatChange() {
    fileInputA.value = '';
    fileInputB.value = '';
}

function isFileOfFormat(file, formatConfig) {
    const lowerName = file.name.toLowerCase();
    if (formatConfig.extensions.some((extension) => lowerName.endsWith(extension))) {
        return true;
    }
    if (formatConfig === TABLE_FORMATS.csv) {
        return ['text/csv', 'application/vnd.ms-excel'].includes(file.type);
    }
    if (formatConfig === TABLE_FORMATS.txt) {
        return ['text/plain', 'text/csv'].includes(file.type);
    }
    if (formatConfig === TABLE_FORMATS.xlsx) {
        return file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    if (formatConfig === TABLE_FORMATS.xls) {
        return file.type === 'application/vnd.ms-excel';
    }
    return false;
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
 * Построить табличные данные для сводного отчёта по полям.
 * @param {Array<Record<string, string>>} differences
 */
function buildAggregatedReportData(differences) {
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
    const rows = [[
        'Поле',
        'Всего расхождений',
        'Несовпадений значений',
        'Отсутствует в файле 1',
        'Отсутствует в файле 2'
    ]];
    const sortedFields = Array.from(counter.keys()).sort();
    for (const field of sortedFields) {
        const { total, mismatch, missingA, missingB } = counter.get(field);
        rows.push([
            field,
            String(total),
            String(mismatch),
            String(missingA),
            String(missingB)
        ]);
    }
    return rows;
}

/**
 * Построить табличные данные подробного отчёта, повторяющего таблицу различий.
 * @param {Array<Record<string, string>>} differences
 * @param {string} nameA
 * @param {string} nameB
 * @param {string} keyField
 */
function buildDetailedReportData(differences, nameA, nameB, keyField) {
    if (!differences.length) {
        throw new Error('Отчёт нельзя сохранить: различия отсутствуют.');
    }

    const effectiveKeyField = keyField || DEFAULT_KEY_HEADER;

    const rows = [[
        effectiveKeyField,
        'Поле',
        'Тип различия',
        `Значение ${nameA}`,
        `Значение ${nameB}`
    ]];

    for (const diff of differences) {
        const fieldName = diff.column === '__missing__' ? 'Строка отсутствует' : diff.column;
        const typeLabel = labelForDifference(diff.difference_type);
        const valueA = diff.value_a || '—';
        const valueB = diff.value_b || '—';
        rows.push([
            diff.keyValue,
            fieldName,
            typeLabel,
            valueA,
            valueB
        ]);
    }

    return rows;
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
