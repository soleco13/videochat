/**
 * Adaptive Video Layout System
 * Интеллектуальная система адаптивного расположения видеокамер участников звонка
 * Поддерживает desktop, планшеты и телефоны с различными ориентациями
 */

// Константы для определения типа устройства
const BREAKPOINTS = {
    PHONE: 480,
    TABLET: 1366,  // Увеличено для поддержки больших планшетов (iPad Pro 12.9" = 1366px)
    DESKTOP: 1367
};

// Минимальные размеры видео
const MIN_VIDEO_SIZE = {
    PHONE: 120,
    TABLET: 180,
    DESKTOP: 200
};

/**
 * Определяет тип устройства на основе ширины экрана
 */
export function getDeviceType() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const isLandscape = width > height;
    const aspectRatio = width / height;
    
    // Для планшетов учитываем не только ширину, но и соотношение сторон
    // Планшеты обычно имеют соотношение сторон около 4:3 или 16:10
    const isTabletAspectRatio = aspectRatio >= 1.2 && aspectRatio <= 2.0;
    
    if (width <= BREAKPOINTS.PHONE) {
        return {
            type: 'phone',
            orientation: isLandscape ? 'landscape' : 'portrait'
        };
    } else if (width <= BREAKPOINTS.TABLET || (width <= 1920 && isTabletAspectRatio && height <= 1366)) {
        // Планшет: ширина до 1366px ИЛИ (ширина до 1920px И соотношение сторон как у планшета И высота <= 1366px)
        return {
            type: 'tablet',
            orientation: isLandscape ? 'landscape' : 'portrait'
        };
    } else {
        return {
            type: 'desktop',
            orientation: isLandscape ? 'landscape' : 'portrait'
        };
    }
}

/**
 * Вычисляет оптимальную сетку для заданного количества участников
 * @param {number} count - Количество участников
 * @param {Object} deviceInfo - Информация об устройстве
 * @param {Object} containerSize - Размеры контейнера {width, height}
 * @param {boolean} isScreenSharing - Режим демонстрации экрана
 * @returns {Object} Конфигурация сетки {cols, rows, videoSize, gap}
 */
export function calculateGridLayout(count, deviceInfo, containerSize, isScreenSharing = false) {
    if (isScreenSharing) {
        return calculateScreenShareLayout(count, deviceInfo, containerSize);
    }
    
    if (count === 0) {
        return { cols: 1, rows: 1, videoSize: 0, gap: 10 };
    }
    
    if (count === 1) {
        // Один участник - максимальный размер по центру
        const availableWidth = Math.max(containerSize.width - 40, 200);
        const availableHeight = Math.max(containerSize.height - 200, 200);
        const size = Math.max(200, Math.min(availableWidth, availableHeight, 800));
        return { cols: 1, rows: 1, videoSize: size, gap: 0 };
    }
    
    const { type, orientation } = deviceInfo;
    
    // Desktop
    if (type === 'desktop') {
        return calculateDesktopGrid(count, containerSize);
    }
    
    // Tablet
    if (type === 'tablet') {
        return calculateTabletGrid(count, orientation, containerSize);
    }
    
    // Phone
    return calculatePhoneGrid(count, orientation, containerSize);
}

/**
 * Вычисляет сетку для desktop
 */
function calculateDesktopGrid(count, containerSize) {
    const { width, height } = containerSize;
    const availableWidth = Math.max(width - 40, 200); // padding, минимум 200px
    const availableHeight = Math.max(height - 200, 200); // padding + controls, минимум 200px
    
    // Определяем оптимальное количество колонок
    let cols = 1;
    let rows = 1;
    
    if (count === 1) {
        // Один участник - максимальный размер по центру
        const size = Math.min(availableWidth, availableHeight, 800);
        return { cols: 1, rows: 1, videoSize: Math.max(size, MIN_VIDEO_SIZE.DESKTOP), gap: 0 };
    } else if (count === 2) {
        cols = 2;
        rows = 1;
    } else if (count === 3) {
        // Три участника - в ряд
        cols = 3;
        rows = 1;
    } else if (count === 4) {
        cols = 2;
        rows = 2;
    } else if (count <= 6) {
        cols = 3;
        rows = 2;
    } else if (count <= 9) {
        cols = 3;
        rows = 3;
    } else if (count <= 12) {
        cols = 4;
        rows = 3;
    } else if (count <= 16) {
        cols = 4;
        rows = 4;
    } else {
        // Для 16+ участников используем более плотную сетку
        cols = Math.ceil(Math.sqrt(count));
        rows = Math.ceil(count / cols);
    }
    
    // Вычисляем размер видео с учетом gap
    const gap = 10;
    const totalGapWidth = Math.max(0, (cols - 1) * gap);
    const totalGapHeight = Math.max(0, (rows - 1) * gap);
    
    const videoWidth = Math.max(0, (availableWidth - totalGapWidth) / cols);
    const videoHeight = Math.max(0, (availableHeight - totalGapHeight) / rows);
    
    // Используем минимальное значение для сохранения квадрата
    const videoSize = Math.max(MIN_VIDEO_SIZE.DESKTOP, Math.min(videoWidth, videoHeight, 500));
    
    // Проверяем минимальный размер
    const minSize = MIN_VIDEO_SIZE.DESKTOP;
    if (videoSize < minSize || videoSize <= 0) {
        // Пересчитываем с меньшим количеством колонок
        return recalculateGridForMinSize(count, availableWidth, availableHeight, minSize, gap);
    }
    
    return { cols, rows, videoSize, gap };
}

/**
 * Вычисляет сетку для планшета
 */
function calculateTabletGrid(count, orientation, containerSize) {
    const { width, height } = containerSize;
    const availableWidth = width - 20;
    const availableHeight = height - 180;
    
    let cols, rows;
    const gap = 8;
    const minSize = MIN_VIDEO_SIZE.TABLET;
    
    if (orientation === 'portrait') {
        // Портретная ориентация: максимум 2 колонки
        cols = Math.min(2, count);
        rows = Math.ceil(count / cols);
    } else {
        // Ландшафтная ориентация: 3-4 колонки
        if (count <= 3) {
            cols = count;
            rows = 1;
        } else if (count <= 6) {
            cols = 3;
            rows = 2;
        } else if (count <= 9) {
            cols = 3;
            rows = 3;
        } else {
            cols = 4;
            rows = Math.ceil(count / cols);
        }
    }
    
    const totalGapWidth = (cols - 1) * gap;
    const totalGapHeight = (rows - 1) * gap;
    
    const videoWidth = (availableWidth - totalGapWidth) / cols;
    const videoHeight = (availableHeight - totalGapHeight) / rows;
    
    let videoSize = Math.min(videoWidth, videoHeight);
    
    if (videoSize < minSize) {
        return recalculateGridForMinSize(count, availableWidth, availableHeight, minSize, gap, orientation === 'portrait' ? 2 : 4);
    }
    
    return { cols, rows, videoSize, gap };
}

/**
 * Вычисляет сетку для телефона
 */
function calculatePhoneGrid(count, orientation, containerSize) {
    const { width, height } = containerSize;
    const availableWidth = width - 16;
    const availableHeight = height - 160;
    
    const gap = 6;
    const minSize = MIN_VIDEO_SIZE.PHONE;
    
    let cols, rows;
    
    if (orientation === 'portrait') {
        // Портретная ориентация: вертикальный список или 1-2 колонки
        if (count === 1) {
            cols = 1;
            rows = 1;
        } else if (count <= 2) {
            cols = 1;
            rows = count;
        } else {
            cols = 2;
            rows = Math.ceil(count / 2);
        }
    } else {
        // Ландшафтная ориентация: 2-3 колонки
        if (count <= 2) {
            cols = count;
            rows = 1;
        } else if (count <= 6) {
            cols = 3;
            rows = 2;
        } else {
            cols = 3;
            rows = Math.ceil(count / 3);
        }
    }
    
    const totalGapWidth = (cols - 1) * gap;
    const totalGapHeight = (rows - 1) * gap;
    
    const videoWidth = (availableWidth - totalGapWidth) / cols;
    const videoHeight = (availableHeight - totalGapHeight) / rows;
    
    let videoSize = Math.min(videoWidth, videoHeight);
    
    if (videoSize < minSize) {
        // Для телефона в портретной ориентации используем scroll
        if (orientation === 'portrait' && count > 2) {
            // Используем фиксированный размер и включаем scroll
            videoSize = Math.min(availableWidth / 2 - gap, 200);
            return { cols, rows, videoSize, gap, scrollable: true };
        }
        return recalculateGridForMinSize(count, availableWidth, availableHeight, minSize, gap, orientation === 'portrait' ? 2 : 3);
    }
    
    return { cols, rows, videoSize, gap, scrollable: false };
}

/**
 * Пересчитывает сетку с учетом минимального размера
 */
function recalculateGridForMinSize(count, availableWidth, availableHeight, minSize, gap, maxCols = null) {
    // Защита от отрицательных или нулевых размеров
    const safeWidth = Math.max(availableWidth, minSize * 2);
    const safeHeight = Math.max(availableHeight, minSize * 2);
    
    let cols = maxCols || Math.ceil(Math.sqrt(count));
    let rows = Math.ceil(count / cols);
    
    // Уменьшаем количество колонок пока не поместится минимальный размер
    while (cols > 1) {
        const totalGapWidth = Math.max(0, (cols - 1) * gap);
        const totalGapHeight = Math.max(0, (rows - 1) * gap);
        
        const videoWidth = Math.max(0, (safeWidth - totalGapWidth) / cols);
        const videoHeight = Math.max(0, (safeHeight - totalGapHeight) / rows);
        
        const videoSize = Math.max(minSize, Math.min(videoWidth, videoHeight));
        
        if (videoSize >= minSize && videoSize > 0) {
            return { cols, rows, videoSize, gap };
        }
        
        cols--;
        rows = Math.ceil(count / cols);
    }
    
    // Если даже с 1 колонкой не помещается, используем минимальный размер
    return { cols: 1, rows: count, videoSize: Math.max(minSize, Math.min(safeWidth, safeHeight)), gap };
}

/**
 * Вычисляет layout для режима демонстрации экрана
 */
function calculateScreenShareLayout(count, deviceInfo, containerSize) {
    const { type, orientation } = deviceInfo;
    const { width, height } = containerSize;
    
    // Размеры для основного экрана (screen share)
    const screenShareArea = {
        width: 0,
        height: 0,
        x: 0,
        y: 0
    };
    
    // Размеры для панели с видео участников
    const participantsPanel = {
        width: 0,
        height: 0,
        direction: 'horizontal', // 'horizontal' или 'vertical'
        scrollable: false
    };
    
    const gap = 8;
    const minVideoSize = type === 'phone' ? MIN_VIDEO_SIZE.PHONE : 
                        type === 'tablet' ? MIN_VIDEO_SIZE.TABLET : 
                        MIN_VIDEO_SIZE.DESKTOP;
    
    if (type === 'desktop') {
        // Desktop: экран слева, участники справа в колонке
        const panelWidth = Math.min(200, width * 0.25);
        screenShareArea.width = width - panelWidth - gap;
        screenShareArea.height = height - 40;
        screenShareArea.x = 0;
        screenShareArea.y = 0;
        
        participantsPanel.width = panelWidth;
        participantsPanel.height = height - 40;
        participantsPanel.direction = 'vertical';
        participantsPanel.scrollable = count > Math.floor((height - 40) / (minVideoSize + gap));
        
        const videoSize = Math.min(panelWidth - 16, minVideoSize + 40);
        return {
            screenShareArea,
            participantsPanel,
            videoSize,
            gap,
            cols: 1,
            rows: count
        };
    } else if (type === 'tablet') {
        if (orientation === 'landscape') {
            // Ландшафт: экран сверху, участники снизу
            const panelHeight = Math.min(180, height * 0.3);
            screenShareArea.width = width - 20;
            screenShareArea.height = height - panelHeight - gap - 40;
            screenShareArea.x = 0;
            screenShareArea.y = 0;
            
            participantsPanel.width = width - 20;
            participantsPanel.height = panelHeight;
            participantsPanel.direction = 'horizontal';
            participantsPanel.scrollable = count > Math.floor((width - 20) / (minVideoSize + gap));
            
            const videoSize = Math.min(panelHeight - 16, minVideoSize + 40);
            return {
                screenShareArea,
                participantsPanel,
                videoSize,
                gap,
                cols: Math.min(count, 4),
                rows: 1
            };
        } else {
            // Портрет: экран сверху, участники снизу (1-2 колонки)
            const panelHeight = Math.min(200, height * 0.35);
            screenShareArea.width = width - 20;
            screenShareArea.height = height - panelHeight - gap - 40;
            
            participantsPanel.width = width - 20;
            participantsPanel.height = panelHeight;
            participantsPanel.direction = 'horizontal';
            participantsPanel.scrollable = count > 2;
            
            const videoSize = Math.min((width - 20 - gap) / 2 - 8, minVideoSize + 40);
            return {
                screenShareArea,
                participantsPanel,
                videoSize,
                gap,
                cols: Math.min(count, 2),
                rows: 1
            };
        }
    } else {
        // Phone
        if (orientation === 'landscape') {
            // Ландшафт: экран сверху, участники снизу (2-3 колонки)
            const panelHeight = Math.min(140, height * 0.4);
            screenShareArea.width = width - 16;
            screenShareArea.height = height - panelHeight - gap - 40;
            
            participantsPanel.width = width - 16;
            participantsPanel.height = panelHeight;
            participantsPanel.direction = 'horizontal';
            participantsPanel.scrollable = count > 3;
            
            const videoSize = Math.min((width - 16 - gap * 2) / 3 - 8, minVideoSize + 20);
            return {
                screenShareArea,
                participantsPanel,
                videoSize,
                gap,
                cols: Math.min(count, 3),
                rows: 1
            };
        } else {
            // Портрет: экран сверху, участники снизу (scroll)
            const panelHeight = Math.min(160, height * 0.45);
            screenShareArea.width = width - 16;
            screenShareArea.height = height - panelHeight - gap - 40;
            
            participantsPanel.width = width - 16;
            participantsPanel.height = panelHeight;
            participantsPanel.direction = 'horizontal';
            participantsPanel.scrollable = true;
            
            const videoSize = Math.min((width - 16 - gap) / 2 - 8, minVideoSize + 20);
            return {
                screenShareArea,
                participantsPanel,
                videoSize,
                gap,
                cols: 2,
                rows: 1
            };
        }
    }
}

/**
 * Применяет вычисленный layout к DOM элементам
 * @param {HTMLElement} container - Контейнер с видео
 * @param {Object} layoutConfig - Конфигурация layout
 * @param {boolean} isScreenSharing - Режим демонстрации экрана
 */
export function applyLayout(container, layoutConfig, isScreenSharing = false) {
    if (!container) return;
    
    if (isScreenSharing) {
        applyScreenShareLayout(container, layoutConfig);
    } else {
        applyGridLayoutInternal(container, layoutConfig);
    }
}

/**
 * Применяет обычный grid layout (экспортируется для использования вне модуля)
 */
export function applyGridLayout(container, config) {
    if (!container) return;
    applyGridLayoutInternal(container, config);
}

/**
 * Применяет обычный grid layout (внутренняя функция)
 */
function applyGridLayoutInternal(container, config) {
    const { cols, rows, videoSize, gap, scrollable } = config;
    
    // Устанавливаем CSS переменные
    container.style.setProperty('--grid-cols', cols);
    container.style.setProperty('--grid-rows', rows);
    container.style.setProperty('--video-size', `${videoSize}px`);
    container.style.setProperty('--grid-gap', `${gap}px`);
    
    // Устанавливаем классы для адаптивности
    container.className = 'video-streams adaptive-grid';
    container.classList.add(`cols-${cols}`);
    container.classList.add(`rows-${rows}`);
    
    if (scrollable) {
        container.classList.add('scrollable');
    } else {
        container.classList.remove('scrollable');
    }
    
    // Применяем размеры к видео контейнерам
    const videoContainers = container.querySelectorAll('.video-container');
    videoContainers.forEach(container => {
        container.style.width = `${videoSize}px`;
        container.style.height = `${videoSize}px`;
        container.style.flexBasis = `${videoSize}px`;
    });
}

/**
 * Применяет layout для режима демонстрации экрана
 */
function applyScreenShareLayout(container, config) {
    const { screenShareArea, participantsPanel, videoSize, gap } = config;
    
    container.classList.add('screen-share-mode');
    container.style.setProperty('--screen-share-width', `${screenShareArea.width}px`);
    container.style.setProperty('--screen-share-height', `${screenShareArea.height}px`);
    container.style.setProperty('--participants-panel-width', `${participantsPanel.width}px`);
    container.style.setProperty('--participants-panel-height', `${participantsPanel.height}px`);
    container.style.setProperty('--participants-video-size', `${videoSize}px`);
    container.style.setProperty('--participants-gap', `${gap}px`);
    
    if (participantsPanel.direction === 'vertical') {
        container.classList.add('participants-vertical');
    } else {
        container.classList.add('participants-horizontal');
    }
    
    if (participantsPanel.scrollable) {
        container.classList.add('participants-scrollable');
    }
}

/**
 * Получает размеры контейнера
 */
export function getContainerSize(container) {
    if (!container) {
        return { width: window.innerWidth, height: window.innerHeight };
    }
    
    const rect = container.getBoundingClientRect();
    return {
        width: rect.width || container.offsetWidth || window.innerWidth,
        height: rect.height || container.offsetHeight || window.innerHeight
    };
}


