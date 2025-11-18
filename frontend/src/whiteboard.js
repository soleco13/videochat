// Whiteboard Manager using Fabric.js
import * as fabric from 'fabric';

export class WhiteboardManager {
    constructor(roomName, videoSocket, userId) {
        this.roomName = roomName;
        this.socket = videoSocket;
        this.userId = userId;
        this.canvas = null;
        this.isActive = false;
        this.currentTool = 'brush'; // brush, rectangle, circle, line, text, select, eraser
        this.cursors = {}; // Храним курсоры других пользователей
        this.isDrawing = false;
        this.debounceTimer = null;
        
        // Очередь изображений для загрузки (только при открытии доски)
        this.pendingImages = []; // Очередь изображений из синхронизации состояния
        this.isLoadingImages = false; // Флаг загрузки изображений
        
        // Настройки инструментов
        this.brushColor = '#000000';
        this.brushWidth = 3;
        this.fillColor = '#ffffff';
        this.strokeColor = '#000000';
    }
    
    init(canvasElement) {
        if (!canvasElement) {
            return;
        }
        
        // Canvas занимает весь экран
        const canvasWidth = window.innerWidth;
        const canvasHeight = window.innerHeight;
        
        // Инициализируем Fabric.js canvas
        this.canvas = new fabric.Canvas(canvasElement, {
            width: canvasWidth,
            height: canvasHeight,
            backgroundColor: '#ffffff',
            isDrawingMode: true
        });
        
        // КРИТИЧНО: Убеждаемся, что canvas интерактивен
        this.canvas.selection = true;
        this.canvas.interactive = true;
        
        // Настраиваем кисть для рисования
        this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
        this.canvas.freeDrawingBrush.width = this.brushWidth;
        this.canvas.freeDrawingBrush.color = this.brushColor;
        
        // Адаптируем размер canvas при изменении размера окна
        window.addEventListener('resize', () => {
            this.resizeCanvas();
        });
        
        
        // Настраиваем события рисования
        this.setupDrawingEvents();
        
        // Настраиваем события объектов
        this.setupObjectEvents();
        
        // Настраиваем события курсора
        this.setupCursorEvents();
        
        // Настраиваем обработку клавиатуры для удаления объектов
        this.setupKeyboardEvents();
    }
    
    setupKeyboardEvents() {
        // Обработка удаления объектов клавишей Delete/Backspace
        document.addEventListener('keydown', (e) => {
            if (!this.isActive) return;
            
            if ((e.key === 'Delete' || e.key === 'Backspace') && this.canvas.getActiveObject()) {
                const activeObject = this.canvas.getActiveObject();
                if (activeObject) {
                    // КРИТИЧНО: Сохраняем ID и тип ДО удаления объекта
                    const objId = activeObject.id;
                    const objType = activeObject.type;
                    
                    this.canvas.remove(activeObject);
                    this.canvas.renderAll();
                    
                    // Отправляем событие удаления с сохраненными данными
                    this.sendObjectEvent('object-removed', activeObject, { id: objId, type: objType });
                }
            }
        });
        
        // Обработка вставки изображений из буфера обмена (Ctrl+V / Cmd+V)
        document.addEventListener('paste', async (e) => {
            if (!this.isActive) {
                return;
            }
            
            // Предотвращаем стандартное поведение вставки
            e.preventDefault();
            e.stopPropagation();
            
            try {
                // Получаем данные из буфера обмена
                const clipboardData = e.clipboardData || window.clipboardData;
                if (!clipboardData) {
                    return;
                }
                
                const items = clipboardData.items || clipboardData.files || [];
                
                let imageFound = false;
                for (let i = 0; i < items.length; i++) {
                    const item = items[i];
                    
                    // Проверяем, является ли элемент изображением
                    if (item.type && item.type.indexOf('image') !== -1) {
                        const file = item.getAsFile();
                        if (file) {
                            imageFound = true;
                            try {
                                await this.addImageFromFile(file);
                            } catch (addError) {
                            }
                            break; // Обрабатываем только первое изображение
                        } else {
                        }
                    }
                }
                
                if (!imageFound) {
                }
            } catch (error) {
            }
        });
    }
    
    resizeCanvas() {
        if (!this.canvas) return;
        
        // Canvas занимает весь экран
        const canvasWidth = window.innerWidth;
        const canvasHeight = window.innerHeight;
        
        this.canvas.setDimensions({
            width: canvasWidth,
            height: canvasHeight
        });
        
        // Обновляем кисть после изменения размера
        this.updateBrush();
        
        // Оптимизация: используем requestAnimationFrame для рендеринга при ресайзе
        requestAnimationFrame(() => {
            try {
                this.canvas.renderAll();
            } catch (error) {
                // Пытаемся очистить поврежденные объекты
                try {
                    const objects = this.canvas.getObjects();
                    const validObjects = objects.filter(obj => obj && typeof obj.render === 'function');
                    this.canvas.clear();
                    validObjects.forEach(obj => {
                        try {
                            this.canvas.add(obj);
                        } catch (e) {
                        }
                    });
                    this.canvas.renderAll();
                } catch (cleanupError) {
                }
            }
        });
    }
    
    setupDrawingEvents() {
        // Событие создания пути (рисование)
        this.canvas.on('path:created', (e) => {
            // НЕ блокируем path:created при isDrawing - это может пропустить важные события
            // Особенно критично при 3+ пользователях, когда события приходят быстро
            // Флаг isDrawing используется только для предотвращения отправки собственных событий
            // при обработке удаленных событий
            const path = e.path;
            // Убеждаемся, что у path есть ID
            if (!path.id) {
                path.id = `${this.userId}-${Date.now()}-${Math.random()}`;
            }
            // Получаем JSON с явным указанием всех свойств, включая id
            // Получаем полный JSON объекта, включая все свойства
            const pathJSON = path.toJSON();
            
            // Убеждаемся, что id включен в JSON
            if (!pathJSON.id) {
                pathJSON.id = path.id;
            }
            
            // Убеждаемся, что type указан
            if (!pathJSON.type) {
                pathJSON.type = 'path';
            }
            
            // Убеждаемся, что className указан
            if (!pathJSON.className) {
                pathJSON.className = 'Path';
            }
            
            // Убеждаемся, что все необходимые свойства присутствуют
            if (!pathJSON.path && path.path) {
                pathJSON.path = path.path;
            }
            
            this.sendDrawingEvent('path-created', pathJSON);
        });
    }
    
    setupObjectEvents() {
        // Событие добавления объекта
        this.canvas.on('object:added', (e) => {
            // НЕ блокируем object:added при isDrawing - это может пропустить важные события
            // Особенно критично при 3+ пользователях, когда события приходят быстро
            // Флаг isDrawing используется только для предотвращения отправки собственных событий
            // при обработке удаленных событий
            const obj = e.target;
            
            // ===== ЛОГИРОВАНИЕ ДЛЯ ДИАГНОСТИКИ =====
            console.log('[Whiteboard] 🎨 canvas object:added event:', {
                objType: obj.type,
                objId: obj.id,
                isImage: obj.type === 'image',
                isGroup: obj.type === 'group',
                hasGetObjects: !!(obj.getObjects && typeof obj.getObjects === 'function')
            });
            // ===== КОНЕЦ ЛОГИРОВАНИЯ =====
            
            // Пропускаем path объекты - они обрабатываются через path:created
            if (obj.type === 'path' || obj instanceof fabric.Path) {
                return;
            }
            // Добавляем ID, если его нет
            if (!obj.id) {
                obj.id = `${this.userId}-${Date.now()}-${Math.random()}`;
            }
            
            // КРИТИЧНО: Если объект - изображение, оно уже отправлено ДО добавления на canvas
            // Не отправляем его снова, чтобы избежать дублирования
            if (obj.type === 'image') {
                console.log('[Whiteboard] ✅ Image object added to canvas, skipping send (already sent)');
                return; // Изображение уже отправлено, не отправляем снова
            }
            
            // КРИТИЧНО: Если объект - Group с изображением внутри, НЕ отправляем Group
            // Изображение уже отправлено отдельно ДО добавления на canvas
            if (obj.type === 'group' && obj.getObjects) {
                try {
                    const objects = obj.getObjects();
                    
                    // ===== ЛОГИРОВАНИЕ ДЛЯ ДИАГНОСТИКИ =====
                    console.log('[Whiteboard] 🔍 Group object added, checking for images:', {
                        groupId: obj.id,
                        objectsCount: objects.length,
                        objectTypes: objects.map(o => o.type)
                    });
                    // ===== КОНЕЦ ЛОГИРОВАНИЯ =====
                    
                    // Ищем изображение в Group более тщательно
                    const imageObj = objects.find(o => {
                        const objType = (o.type || '').toLowerCase();
                        const objClassName = (o.className || '').toLowerCase();
                        const hasImageType = objType === 'image' || objClassName === 'image';
                        const hasSrc = !!(o.src || o._src || o._imageUrl);
                        const hasUrlSrc = !!(o.src && (o.src.startsWith('/media/') || o.src.startsWith('http://') || o.src.startsWith('https://')));
                        return hasImageType || hasSrc || hasUrlSrc;
                    });
                    
                    if (imageObj) {
                        // НЕ отправляем Group, так как изображение уже отправлено отдельно ДО добавления на canvas
                        console.log('[Whiteboard] ✅ Group contains image, skipping send (image already sent)');
                        return; // Не отправляем Group, только изображение
                    } else {
                        console.log('[Whiteboard] ⚠️ Group does not contain image, will send Group');
                    }
                } catch (e) {
                    console.error('[Whiteboard] ❌ Error checking Group for images:', e);
                }
            }
            
            this.sendObjectEvent('object-added', obj);
        });
        
        // Событие изменения объекта
        this.canvas.on('object:modified', (e) => {
            // КРИТИЧНО: НЕ блокируем object:modified для изображений, даже если isDrawing = true
            // Это критично, так как пользователи должны видеть изменения изображений в реальном времени
            const obj = e.target;
            
            console.log('[Whiteboard] 🎨 object:modified event fired:', {
                objType: obj.type,
                objId: obj.id,
                isImage: obj.type === 'image',
                isDrawing: this.isDrawing
            });
            
            // Для изображений используем специальный метод
            if (obj.type === 'image') {
                this._sendImageModification(obj, 'object-modified');
                return;
            }
            
            // Для других объектов проверяем isDrawing
            if (this.isDrawing) return;
            
            // КРИТИЧНО: Если объект - Group с изображением внутри, отправляем изменения изображения отдельно
            if (obj.type === 'group' && obj.getObjects) {
                try {
                    const objects = obj.getObjects();
                    const imageObj = objects.find(o => o.type === 'image');
                    if (imageObj) {
                        // Вычисляем абсолютные координаты изображения из Group
                        const groupLeft = obj.left || 0;
                        const groupTop = obj.top || 0;
                        const groupScaleX = obj.scaleX || 1;
                        const groupScaleY = obj.scaleY || 1;
                        const groupAngle = obj.angle || 0;
                        
                        // Создаем временный объект с абсолютными координатами
                        const tempImageObj = {
                            ...imageObj,
                            left: groupLeft + (imageObj.left || 0) * groupScaleX,
                            top: groupTop + (imageObj.top || 0) * groupScaleY,
                            scaleX: (imageObj.scaleX || 1) * groupScaleX,
                            scaleY: (imageObj.scaleY || 1) * groupScaleY,
                            angle: (imageObj.angle || 0) + groupAngle
                        };
                        
                        this._sendImageModification(tempImageObj, 'object-modified');
                        return; // Не отправляем Group, только изображение
                    }
                } catch (e) {
                    console.error('[Whiteboard] ❌ Error processing group with image:', e);
                }
            }
            
            this.sendObjectEvent('object-modified', obj);
        });
        
        // Событие удаления объекта
        this.canvas.on('object:removed', (e) => {
            if (this.isDrawing) return;
            const obj = e.target;
            // КРИТИЧНО: Сохраняем ID и тип ДО того, как объект будет полностью удален
            const objId = obj.id;
            const objType = obj.type;
            this.sendObjectEvent('object-removed', obj, { id: objId, type: objType });
        });
        
        // Событие перемещения объекта (с дебаунсингом для оптимизации)
        this.movingDebounceTimer = null;
        this.canvas.on('object:moving', (e) => {
            // КРИТИЧНО: НЕ блокируем object:moving для изображений, даже если isDrawing = true
            const obj = e.target;
            
            console.log('[Whiteboard] 🎨 object:moving event fired:', {
                objType: obj.type,
                objId: obj.id,
                isImage: obj.type === 'image',
                isDrawing: this.isDrawing
            });
            
            // Для изображений используем специальный метод с дебаунсингом
            if (obj.type === 'image') {
                // Дебаунсинг для оптимизации - отправляем только последнее состояние
                if (this.movingDebounceTimer) {
                    clearTimeout(this.movingDebounceTimer);
                }
                this.movingDebounceTimer = setTimeout(() => {
                    this._sendImageModification(obj, 'object-moving');
                }, 50);
                return;
            }
            
            // Для других объектов проверяем isDrawing
            if (this.isDrawing) return;
            
            // КРИТИЧНО: Если объект - Group с изображением внутри, отправляем изменения изображения отдельно
            if (obj.type === 'group' && obj.getObjects) {
                try {
                    const objects = obj.getObjects();
                    const imageObj = objects.find(o => o.type === 'image');
                    if (imageObj) {
                        // Дебаунсинг для оптимизации - отправляем только последнее состояние
                        if (this.movingDebounceTimer) {
                            clearTimeout(this.movingDebounceTimer);
                        }
                        this.movingDebounceTimer = setTimeout(() => {
                            // Создаем временный объект с абсолютными координатами
                            const tempImageObj = {
                                ...imageObj,
                                left: obj.left + (imageObj.left || 0) * (obj.scaleX || 1),
                                top: obj.top + (imageObj.top || 0) * (obj.scaleY || 1),
                                scaleX: (imageObj.scaleX || 1) * (obj.scaleX || 1),
                                scaleY: (imageObj.scaleY || 1) * (obj.scaleY || 1),
                                angle: (imageObj.angle || 0) + (obj.angle || 0)
                            };
                            this._sendImageModification(tempImageObj, 'object-moving');
                        }, 50);
                        return; // Не отправляем Group, только изображение
                    }
                } catch (e) {
                    console.error('[Whiteboard] ❌ Error processing group with image:', e);
                }
            }
            
            // Дебаунсинг для оптимизации - отправляем только последнее состояние
            if (this.movingDebounceTimer) {
                clearTimeout(this.movingDebounceTimer);
            }
            this.movingDebounceTimer = setTimeout(() => {
                this.sendObjectEvent('object-moving', obj);
            }, 50);
        });
        
        // Событие изменения размера объекта (с дебаунсингом для оптимизации)
        this.scalingDebounceTimer = null;
        this.canvas.on('object:scaling', (e) => {
            // КРИТИЧНО: НЕ блокируем object:scaling для изображений, даже если isDrawing = true
            const obj = e.target;
            
            console.log('[Whiteboard] 🎨 object:scaling event fired:', {
                objType: obj.type,
                objId: obj.id,
                isImage: obj.type === 'image',
                isDrawing: this.isDrawing
            });
            
            // Для изображений используем специальный метод с дебаунсингом
            if (obj.type === 'image') {
                // Дебаунсинг для оптимизации - отправляем только последнее состояние
                if (this.scalingDebounceTimer) {
                    clearTimeout(this.scalingDebounceTimer);
                }
                this.scalingDebounceTimer = setTimeout(() => {
                    this._sendImageModification(obj, 'object-scaling');
                }, 50);
                return;
            }
            
            // Для других объектов проверяем isDrawing
            if (this.isDrawing) return;
            
            // КРИТИЧНО: Если объект - Group с изображением внутри, отправляем изменения изображения отдельно
            if (obj.type === 'group' && obj.getObjects) {
                try {
                    const objects = obj.getObjects();
                    const imageObj = objects.find(o => o.type === 'image');
                    if (imageObj) {
                        // Дебаунсинг для оптимизации - отправляем только последнее состояние
                        if (this.scalingDebounceTimer) {
                            clearTimeout(this.scalingDebounceTimer);
                        }
                        this.scalingDebounceTimer = setTimeout(() => {
                            // Создаем временный объект с абсолютными координатами
                            const tempImageObj = {
                                ...imageObj,
                                left: obj.left + (imageObj.left || 0) * (obj.scaleX || 1),
                                top: obj.top + (imageObj.top || 0) * (obj.scaleY || 1),
                                scaleX: (imageObj.scaleX || 1) * (obj.scaleX || 1),
                                scaleY: (imageObj.scaleY || 1) * (obj.scaleY || 1),
                                angle: (imageObj.angle || 0) + (obj.angle || 0)
                            };
                            this._sendImageModification(tempImageObj, 'object-scaling');
                        }, 50);
                        return; // Не отправляем Group, только изображение
                    }
                } catch (e) {
                    console.error('[Whiteboard] ❌ Error processing group with image:', e);
                }
            }
            
            // Дебаунсинг для оптимизации - отправляем только последнее состояние
            if (this.scalingDebounceTimer) {
                clearTimeout(this.scalingDebounceTimer);
            }
            this.scalingDebounceTimer = setTimeout(() => {
                this.sendObjectEvent('object-scaling', obj);
            }, 50);
        });
    }
    
    setupCursorEvents() {
        // Отслеживаем движение курсора с дебаунсингом
        this.canvas.on('mouse:move', (e) => {
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }
            
            this.debounceTimer = setTimeout(() => {
                const pointer = this.canvas.getPointer(e.e);
                this.sendCursorPosition(pointer);
            }, 50); // Отправляем позицию курсора каждые 50ms
        });
        
        // Отслеживаем выход курсора за пределы canvas
        this.canvas.on('mouse:out', () => {
            this.sendCursorPosition(null);
        });
    }
    
    sendDrawingEvent(type, pathData) {
        // Не отправляем события, если идет обработка удаленных событий
        // Это предотвращает отправку собственных событий при обработке удаленных
        if (this.isDrawing) {
            return;
        }
        
        if (!this.socket) {
            return;
        }
        
        if (this.socket.readyState !== WebSocket.OPEN) {
            return;
        }
        
        try {
            // Оптимизация: ограничиваем размер данных path
            const optimizedPathData = { ...pathData };
            if (optimizedPathData.path && Array.isArray(optimizedPathData.path) && optimizedPathData.path.length > 1000) {
                // Если path слишком большой, берем только последние точки
                optimizedPathData.path = optimizedPathData.path.slice(-1000);
            }
            
            const message = {
                type: 'whiteboard-draw',
                room: this.roomName,
                from: this.userId,
                data: {
                    eventType: type,
                    path: optimizedPathData
                }
            };
            
            const messageStr = JSON.stringify(message);
            
            // Проверяем размер сообщения (максимум 1MB для WebSocket)
            if (messageStr.length > 1024 * 1024) {
                return;
            }
            
            this.socket.send(messageStr);
        } catch (error) {
        }
    }
    
    sendObjectEvent(type, obj, savedData = null) {
        // Не отправляем события, если идет обработка удаленных событий
        // Это предотвращает отправку собственных событий при обработке удаленных
        if (this.isDrawing) {
            return;
        }
        
        if (!this.socket) {
            return;
        }
        
        if (this.socket.readyState !== WebSocket.OPEN) {
            return;
        }
        
        try {
            let objJSON;
            
            // Для object-removed используем сохраненные данные (объект уже удален)
            if (type === 'object-removed' && savedData) {
                objJSON = {
                    id: savedData.id,
                    type: savedData.type || 'unknown'
                };
            } else {
                // Для других событий используем toJSON()
                try {
                    objJSON = obj.toJSON();
                    
                    // КРИТИЧНО: Если объект является Group, но содержит изображение, извлекаем изображение
                    let actualObj = obj;
                    if (obj.type === 'group' && objJSON.objects && Array.isArray(objJSON.objects)) {
                        // Ищем изображение внутри Group
                        const imageInGroup = objJSON.objects.find(o => {
                            const objType = (o.type || '').toLowerCase();
                            const hasImageType = objType === 'image';
                            const hasSrc = !!(o.src || o._src);
                            const hasLargeStringField = Object.keys(o).some(key => {
                                const value = o[key];
                                return typeof value === 'string' && value.length > 1000 && value.startsWith('data:image');
                            });
                            return hasImageType || hasSrc || hasLargeStringField;
                        });
                        
                        if (imageInGroup) {
                            // Извлекаем изображение из Group
                            // КРИТИЧНО: Сохраняем src из imageInGroup
                            const imageSrc = imageInGroup.src || imageInGroup._src || imageInGroup._imageUrl;
                            objJSON = {
                                ...imageInGroup,
                                id: obj.id || imageInGroup.id // Сохраняем ID группы
                            };
                            // Принудительно устанавливаем тип на image
                            objJSON.type = 'image';
                            // КРИТИЧНО: Убеждаемся, что src сохранен
                            if (!objJSON.src && imageSrc) {
                                objJSON.src = imageSrc;
                            }
                            // Также ищем src в других полях imageInGroup (URL или base64)
                            if (!objJSON.src) {
                                const srcField = Object.keys(imageInGroup).find(key => {
                                    const value = imageInGroup[key];
                                    if (typeof value === 'string') {
                                        // Проверяем URL
                                        if (value.startsWith('/media/') || value.startsWith('http://') || value.startsWith('https://')) {
                                            return true;
                                        }
                                        // Проверяем base64
                                        if (value.length > 1000 && value.startsWith('data:image')) {
                                            return true;
                                        }
                                    }
                                    return false;
                                });
                                if (srcField) {
                                    objJSON.src = imageInGroup[srcField];
                                }
                            }
                            const srcInfo = objJSON.src ? 
                                (objJSON.src.startsWith('http://') || objJSON.src.startsWith('https://') || objJSON.src.startsWith('/') ? 
                                    `URL: ${objJSON.src}` : 
                                    `base64 length: ${objJSON.src.length}`) : 
                                'no src';
                        }
                    }
                    
                    // КРИТИЧНО: Для изображений принудительно устанавливаем тип и сохраняем src
                    if (obj.type === 'image' || objJSON.type === 'image') {
                        // Принудительно устанавливаем тип на 'image' (не 'Image' или 'Group')
                        objJSON.type = 'image';
                        
                        // КРИТИЧНО: Убеждаемся, что src (URL) сохранен в objJSON
                        // Приоритет: _imageUrl > _src > element.src
                        // Теперь используем URL сервера вместо base64
                        if (!objJSON.src) {
                            if (obj._imageUrl) {
                                objJSON.src = obj._imageUrl;
                            } else if (obj._src) {
                            objJSON.src = obj._src;
                                // Проверяем, это URL или base64
                                if (obj._src.startsWith('http://') || obj._src.startsWith('https://') || obj._src.startsWith('/')) {
                                } else {
                                }
                            } else if (obj.getElement && obj.getElement()) {
                                // Пытаемся получить src из HTML элемента
                                try {
                                    const imgEl = obj.getElement();
                                    if (imgEl && imgEl.src) {
                                        objJSON.src = imgEl.src;
                                    }
                                } catch (e) {
                                }
                            }
                        }
                        
                    }
                    
                    // КРИТИЧНО: Проверяем, что toJSON() не изменил тип на Group
                    if ((obj.type === 'image' || objJSON.type === 'image') && objJSON.type && objJSON.type.toLowerCase() !== 'image') {
                        // Принудительно устанавливаем тип обратно на image
                        objJSON.type = 'image';
                    }
                    
                } catch (e) {
                    // Fallback: создаем минимальный объект
                    objJSON = {
                        id: obj.id || `fallback-${Date.now()}`,
                        type: obj.type || 'unknown'
                    };
                }
            }
            
            // Убеждаемся, что ID всегда сохраняется (критично для всех событий)
            if (obj.id && !objJSON.id) {
                objJSON.id = obj.id;
            }
            
            // Если ID все еще отсутствует, это критическая ошибка
            if (!objJSON.id) {
                return; // Не отправляем событие без ID
            }
            
            // Для изображений нужно убедиться, что src (URL) сохранен
            // НО только для object-added, не для object-removed
            // Работаем с objJSON.type, так как изображение могло быть извлечено из Group
            if ((obj.type === 'image' || objJSON.type === 'image') && type !== 'object-removed') {
                // Если src уже есть в objJSON (из предыдущей обработки или извлечения из Group), используем его
                if (objJSON.src) {
                    const srcInfo = objJSON.src.startsWith('http://') || objJSON.src.startsWith('https://') || objJSON.src.startsWith('/') ? 
                        `URL: ${objJSON.src}` : 
                        `base64 length: ${objJSON.src.length}`;
                } else {
                // Пытаемся получить src разными способами
                let imgSrc = null;
                
                    // Способ 1: из сохраненного свойства _imageUrl или _src
                    if (obj._imageUrl) {
                        imgSrc = obj._imageUrl;
                    } else if (obj._src) {
                    imgSrc = obj._src;
                        const srcInfo = imgSrc.startsWith('http://') || imgSrc.startsWith('https://') || imgSrc.startsWith('/') ? 
                            `URL: ${imgSrc}` : 
                            `base64 length: ${imgSrc.length}`;
                }
                // Способ 2: через getElement()
                else if (obj.getElement) {
                    try {
                        const imgElement = obj.getElement();
                        if (imgElement && imgElement.src) {
                            imgSrc = imgElement.src;
                        }
                    } catch (e) {
                    }
                }
                // Способ 3: через _element (внутреннее свойство fabric)
                if (!imgSrc && obj._element && obj._element.src) {
                    imgSrc = obj._element.src;
                    }
                    
                    // Устанавливаем src в objJSON
                if (imgSrc) {
                    objJSON.src = imgSrc;
                        const srcInfo = imgSrc.startsWith('http://') || imgSrc.startsWith('https://') || imgSrc.startsWith('/') ? 
                            `URL: ${imgSrc}` : 
                            `base64 length: ${imgSrc.length}`;
                } else {
                    // Не отправляем событие, если нет src для изображения
                    return;
                    }
                }
            }
            
            // ===== ЛОГИРОВАНИЕ ДЛЯ ДИАГНОСТИКИ =====
            console.log('[Whiteboard] 📤 sendObjectEvent sending:', {
                eventType: type,
                originalType: obj.type,
                jsonType: objJSON.type,
                hasSrc: !!objJSON.src,
                srcLength: objJSON.src ? objJSON.src.length : 0,
                srcPreview: objJSON.src ? objJSON.src.substring(0, 100) : 'none',
                objectId: objJSON.id
            });
            // ===== КОНЕЦ ЛОГИРОВАНИЯ =====
            
            const message = {
                type: 'whiteboard-object',
                room: this.roomName,
                from: this.userId,
                data: {
                    eventType: type,
                    object: objJSON
                }
            };
            
            const messageStr = JSON.stringify(message);
            
            // Проверяем размер сообщения (максимум 5MB для WebSocket, но для изображений может быть больше)
            const maxSize = obj.type === 'image' ? 10 * 1024 * 1024 : 1024 * 1024;
            if (messageStr.length > maxSize) {
                return;
            }
            
            this.socket.send(messageStr);
        } catch (error) {
        }
    }
    
    sendCursorPosition(pointer) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            return;
        }
        
        this.socket.send(JSON.stringify({
            type: 'whiteboard-cursor',
            room: this.roomName,
            from: this.userId,
            data: {
                x: pointer ? pointer.x : null,
                y: pointer ? pointer.y : null
            }
        }));
    }
    
    // Обработка входящих событий от других пользователей
    handleRemoteDrawing(data) {
        if (!this.canvas) {
            return;
        }
        
        // Игнорируем собственные события (но не системные сообщения для восстановления состояния)
        if (data.from === this.userId && data.from !== 'system') {
            return; // Игнорируем свои события
        }
        
        // Для системных сообщений - обрабатываем сразу (пути рисования легкие)
        // Изображения обрабатываются отдельно в handleRemoteObject
        
        
        // КРИТИЧНО: Для системных сообщений (восстановление состояния) не блокируем события
        // чтобы не пропустить важные события синхронизации
        if (data.from !== 'system') {
        this.isDrawing = true;
        }
        
        try {
            if (data.data && data.data.eventType === 'path-created' && data.data.path) {
                const pathData = data.data.path;
                
                console.log('[Whiteboard] 📝 Processing path from:', {
                    from: data.from,
                    isSystem: data.from === 'system',
                    pathId: pathData.id,
                    hasPath: !!pathData.path,
                    pathLength: pathData.path ? pathData.path.length : 0
                });
                
                // Нормализуем данные path
                if (!pathData.type && !pathData.className) {
                    // Если нет типа, но есть path (массив точек), это точно Path
                    if (pathData.path || (Array.isArray(pathData.path) && pathData.path.length > 0)) {
                        pathData.type = 'path';
                        pathData.className = 'Path';
                    }
                }
                
                // Используем ПРЯМОЕ создание Path - enlivenObjects не работает надежно
                
                // КРИТИЧНО: Для системных сообщений НЕ устанавливаем isDrawing, чтобы не блокировать события
                const wasDrawing = this.isDrawing;
                // Устанавливаем isDrawing только для НЕ-системных сообщений
                if (data.from !== 'system') {
                this.isDrawing = true;
                }
                
                try {
                    // Проверяем наличие path массива
                    let pathArray = pathData.path;
                    if (!pathArray || !Array.isArray(pathArray)) {
                        console.warn('[Whiteboard] ⚠️ Invalid path data, missing path array');
                        if (data.from !== 'system') {
                        this.isDrawing = wasDrawing;
                        }
                        return;
                    }
                    
                    if (pathArray.length === 0) {
                        console.warn('[Whiteboard] ⚠️ Empty path array');
                        if (data.from !== 'system') {
                        this.isDrawing = wasDrawing;
                        }
                        return;
                    }
                    
                    // Создаем Path напрямую из данных
                    const pathId = pathData.id || `${data.from}-${Date.now()}-${Math.random()}`;
                    
                    // Проверяем, не существует ли уже объект с таким ID
                    const existingObj = this.canvas.getObjects().find(o => o.id === pathId);
                    if (existingObj) {
                        console.log('[Whiteboard] ⚠️ Path already exists, skipping:', pathId);
                        if (data.from !== 'system') {
                        this.isDrawing = wasDrawing;
                        }
                        return;
                    }
                    
                    // Создаем новый Path объект
                    const path = new fabric.Path(pathArray, {
                        left: pathData.left || 0,
                        top: pathData.top || 0,
                        stroke: pathData.stroke || pathData.strokeColor || '#000000',
                        strokeWidth: pathData.strokeWidth || pathData.brushWidth || 3,
                        fill: pathData.fill || '',
                        id: pathId
                    });
                    
                    // Копируем все остальные свойства из pathData
                    if (pathData.scaleX !== undefined) path.scaleX = pathData.scaleX;
                    if (pathData.scaleY !== undefined) path.scaleY = pathData.scaleY;
                    if (pathData.angle !== undefined) path.angle = pathData.angle;
                    if (pathData.opacity !== undefined) path.opacity = pathData.opacity;
                    if (pathData.shadow) path.shadow = pathData.shadow;
                    if (pathData.strokeLineCap) path.strokeLineCap = pathData.strokeLineCap;
                    if (pathData.strokeLineJoin) path.strokeLineJoin = pathData.strokeLineJoin;
                    if (pathData.strokeMiterLimit !== undefined) path.strokeMiterLimit = pathData.strokeMiterLimit;
                    
                    // Добавляем объект на canvas
                    this.canvas.add(path);
                    
                    console.log('[Whiteboard] ✅ Path added to canvas:', {
                        pathId: pathId,
                        from: data.from,
                        isSystem: data.from === 'system'
                    });
                    
                    // Восстанавливаем флаг и рендерим с оптимизацией
                    if (data.from !== 'system') {
                    this.isDrawing = wasDrawing;
                    }
                    try {
                        // Используем requestAnimationFrame для оптимизации рендеринга
                        requestAnimationFrame(() => {
                            this.canvas.renderAll();
                        });
                    } catch (renderError) {
                        if (data.from !== 'system') {
                        this.isDrawing = wasDrawing;
                        }
                    }
                } catch (error) {
                    console.error('[Whiteboard] ❌ Error creating path:', error);
                    if (data.from !== 'system') {
                    this.isDrawing = wasDrawing;
                    }
                }
            } else {
                console.warn('[Whiteboard] ⚠️ Invalid path data structure:', {
                    hasData: !!data.data,
                    hasEventType: !!data.data?.eventType,
                    eventType: data.data?.eventType,
                    hasPath: !!data.data?.path
                });
            }
        } catch (error) {
        } finally {
            // КРИТИЧНО: Для системных сообщений (восстановление состояния) сбрасываем флаг сразу
            // чтобы не блокировать события рисования после переподключения
            if (data.from === 'system') {
                this.isDrawing = false;
                // КРИТИЧНО: Убеждаемся, что canvas остается интерактивным после восстановления состояния
                if (this.canvas) {
                    this.canvas.selection = true;
                    this.canvas.interactive = true;
                }
            } else {
                // Для других сообщений сбрасываем флаг с небольшой задержкой, чтобы избежать конфликтов
            setTimeout(() => {
                this.isDrawing = false;
            }, 50);
            }
        }
    }
    
    handleRemoteObject(data) {
        console.log('[Whiteboard] 🔍 handleRemoteObject called:', {
            from: data.from,
            eventType: data.data?.eventType,
            objType: data.data?.object?.type,
            objId: data.data?.object?.id,
            isSystemMessage: data.from === 'system'
        });
        
        // ОСОБАЯ ОБРАБОТКА ДЛЯ СИСТЕМНЫХ СООБЩЕНИЙ (восстановление состояния)
        if (data.from === 'system') {
            this._handleSystemMessage(data);
            return;
        }
        
        // Игнорируем собственные события
        if (data.from === this.userId) {
            console.log('[Whiteboard] ⚠️ Ignoring own event:', data.data?.eventType);
            return;
        }
        
        if (!data.data || !data.data.eventType) {
            console.log('[Whiteboard] ⚠️ Missing data.data or eventType');
            return;
        }
        
        const { eventType, object } = data.data;
        
        // Проверяем, является ли объект изображением
        const isImage = this._isImageObject(object);
        
        if (isImage) {
            console.log('[Whiteboard] 🖼️ Image object detected, using unified handler');
            this._handleImageEvent(eventType, object, data.from);
            return;
        }
        
        // Обработка не-изображений (существующая логика)
        // Временно устанавливаем флаг, чтобы не отправлять события обратно
        // НО только для операций добавления/изменения, не для удаления
        const wasDrawing = this.isDrawing;
        
        // КРИТИЧНО: Логируем все типы событий для диагностики
        if (eventType === 'object-modified' || eventType === 'object-moving' || eventType === 'object-scaling') {
            console.log('[Whiteboard] 🔄 Processing modification event:', {
                eventType: eventType,
                objectType: data.data.object?.type,
                objectId: data.data.object?.id,
                hasObject: !!data.data.object
            });
        }
            
            // КРИТИЧНО: Для object-modified не устанавливаем isDrawing, чтобы не блокировать события рисования
            // Для удаления не устанавливаем isDrawing - это может блокировать другие операции
            // Для системных сообщений (восстановление состояния) не блокируем события
            // чтобы не пропустить важные события синхронизации
            if (eventType !== 'object-removed' && 
                eventType !== 'object-modified' && 
                eventType !== 'object-moving' && 
                eventType !== 'object-scaling' && 
                data.from !== 'system') {
                this.isDrawing = true;
            }
            
            const objData = data.data.object;
            
            // ===== ЛОГИРОВАНИЕ ДЛЯ ДИАГНОСТИКИ =====
            if (eventType === 'object-added' && objData) {
                console.log('[Whiteboard] 📥 Received object-added:', {
                    from: data.from || 'unknown',
                    objType: objData.type,
                    objId: objData.id,
                    hasSrc: !!objData.src,
                    srcLength: objData.src ? objData.src.length : 0,
                    srcPreview: objData.src ? objData.src.substring(0, 100) : 'none',
                    // КРИТИЧНО: Выводим все ключи объекта для диагностики
                    objKeys: Object.keys(objData),
                    // КРИТИЧНО: Выводим полный объект для диагностики
                    fullObjData: objData
                });
                
                // КРИТИЧНО: ЯВНАЯ ОБРАБОТКА ДЛЯ ОБЪЕКТОВ ТИПА 'image' ПРЯМО ПОСЛЕ ПОЛУЧЕНИЯ
                // Это гарантирует, что объекты типа 'image' будут обработаны независимо от других проверок
                const isImageTypeDirect = objData.type === 'image' || objData.type === 'Image' || objData.type === 'IMAGE';
                const hasSrcDirect = !!(objData.src || objData._src || objData._imageUrl);
                
                if (isImageTypeDirect && hasSrcDirect) {
                    console.log('[Whiteboard] 🚀 DIRECT IMAGE PROCESSING: Object is image type, processing immediately');
                    const imageData = { ...objData };
                    
                    // КРИТИЧНО: Ищем src в разных полях
                    if (!imageData.src) {
                        imageData.src = objData._imageUrl || objData._src || objData.src;
                    }
                    
                    // КРИТИЧНО: Преобразуем относительный путь в полный URL
                    if (imageData.src && imageData.src.startsWith('/') && !imageData.src.startsWith('//')) {
                        imageData.src = window.location.origin + imageData.src;
                    }
                    
                    imageData.type = 'image';
                    
                    // Если это системное сообщение для синхронизации состояния - добавляем в очередь
                    if (data.from === 'system') {
                        this.pendingImages.push(imageData);
                        if (this.isActive) {
                            this._loadNextImage();
                        }
                        this.isDrawing = false;
                        if (this.canvas) {
                            this.canvas.selection = true;
                            this.canvas.interactive = true;
                        }
                        return;
                    }
                    
                    // Для обычных сообщений от других пользователей - загружаем сразу (если доска открыта)
                    if (!this.isActive) {
                        this.pendingImages.push(imageData);
                        this.isDrawing = wasDrawing;
                        return;
                    }
                    
                    // Загружаем изображение сразу
                    this.isDrawing = wasDrawing;
                    console.log('[Whiteboard] 🎯 Calling _loadImageToCanvas (DIRECT IMAGE PROCESSING)');
                    this._loadImageToCanvas(imageData, (success) => {
                        console.log('[Whiteboard] Direct image load callback, success:', success);
                        this.isDrawing = wasDrawing;
                    });
                    return; // Выходим, так как изображение обрабатывается
                }
                
                // Проверка, вызывается ли _loadImageToCanvas
                if (objData.type === 'image' || objData.type === 'Image' || objData.type === 'IMAGE') {
                    console.log('[Whiteboard] 🔍 This is an IMAGE object, should load to canvas');
                }
            }
            if (!objData && eventType !== 'object-removed') {
                this.isDrawing = wasDrawing;
                return;
            }
            
            // Пропускаем path объекты - они обрабатываются через handleRemoteDrawing
            // КРИТИЧНО: Проверяем с учетом регистра
            const objTypeLower = (objData.type || '').toLowerCase();
            const objClassNameLower = (objData.className || '').toLowerCase();
            if (objTypeLower === 'path' || objClassNameLower === 'path') {
                return;
            }
            
            // КРИТИЧНО: Для object-added с изображениями не устанавливаем isDrawing, чтобы не блокировать события рисования
            // Проверяем, является ли объект изображением ДО установки флага
            const isImageForAdded = eventType === 'object-added' && (objTypeLower === 'image' || objClassNameLower === 'image');
            const isGroupWithImage = eventType === 'object-added' && objTypeLower === 'group' && objData.objects && 
                Array.isArray(objData.objects) && objData.objects.some(o => {
                    const oType = (o.type || '').toLowerCase();
                    const oClassName = (o.className || '').toLowerCase();
                    return oType === 'image' || oClassName === 'image' || !!(o.src || o._src || o._imageUrl);
                });
            
            if (isImageForAdded || isGroupWithImage) {
                // КРИТИЧНО: Для изображений сбрасываем isDrawing, чтобы не блокировать события рисования
                // Флаг мог быть установлен выше, но для изображений мы его сбрасываем
                this.isDrawing = wasDrawing;
            }
            
            try {
            // КРИТИЧНО: Логируем eventType перед проверкой
            console.log('[Whiteboard] 🔍 Checking eventType:', {
                eventType: eventType,
                eventTypeType: typeof eventType,
                eventTypeLength: eventType ? eventType.length : 0,
                isObjectAdded: eventType === 'object-added',
                isObjectModified: eventType === 'object-modified',
                isObjectMoving: eventType === 'object-moving',
                isObjectScaling: eventType === 'object-scaling',
                willEnterObjectAdded: eventType === 'object-added',
                willEnterObjectModified: (eventType === 'object-modified' || eventType === 'object-moving' || eventType === 'object-scaling')
            });
            
            // КРИТИЧНО: Логируем перед проверкой if (eventType === 'object-added')
            console.log('[Whiteboard] 🔍 About to check if (eventType === "object-added"):', {
                eventType: eventType,
                willEnter: eventType === 'object-added',
                comparison: `"${eventType}" === "object-added"`,
                result: eventType === 'object-added'
            });
            
            if (eventType === 'object-added') {
                console.log('[Whiteboard] ✅ ENTERED if (eventType === "object-added") block');
                
                // КРИТИЧНО: Явная проверка для объектов типа 'image'
                // Если объект имеет тип 'image', обрабатываем его как изображение
                const objTypeLower = (objData.type || '').toLowerCase();
                const classNameLower = (objData.className || '').toLowerCase();
                const isExplicitImage = objTypeLower === 'image' || classNameLower === 'image';
                
                // ===== ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ДЛЯ ДИАГНОСТИКИ =====
                console.log('[Whiteboard] 🔍 Image detection check:', {
                    objType: objData.type,
                    objTypeLower: objTypeLower,
                    className: objData.className,
                    classNameLower: classNameLower,
                    isExplicitImage: isExplicitImage,
                    hasSrc: !!objData.src,
                    srcValue: objData.src ? objData.src.substring(0, 100) : 'NO SRC',
                    srcStartsWithMedia: objData.src ? objData.src.startsWith('/media/') : false,
                    srcStartsWithHttp: objData.src ? (objData.src.startsWith('http://') || objData.src.startsWith('https://')) : false
                });
                // ===== КОНЕЦ ЛОГИРОВАНИЯ =====
                
                // КРИТИЧНО: Проверяем наличие src с URL ПЕРЕД определением типа объекта
                // Это гарантирует, что изображения правильно определяются даже если тип не указан
                const hasUrlSrc = !!(objData.src && (objData.src.startsWith('/media/') || objData.src.startsWith('http://') || objData.src.startsWith('https://')));
                
                // КРИТИЧНО: Явная проверка типа 'image' (независимо от регистра)
                // Если objData.type === 'image' (или 'Image', 'IMAGE'), это точно изображение
                const isImageType = objData.type === 'image' || objData.type === 'Image' || objData.type === 'IMAGE';
                
                // Для изображений используем специальную обработку
                // Также проверяем Group, так как изображения могут быть обернуты в Group
                // КРИТИЧНО: Fabric.js может возвращать тип с большой буквы (Group, Image)
                // КРИТИЧНО: Определяем изображение по типу или по наличию URL src
                // Если есть src с URL, это точно изображение (приоритет этой проверки)
                // КРИТИЧНО: Явная проверка типа 'image' имеет наивысший приоритет
                const isImage = isImageType || isExplicitImage || hasUrlSrc;
                const isGroup = objTypeLower === 'group' || classNameLower === 'group';
                
                
                // Если это группа, проверяем, содержит ли она изображение
                let imageInGroup = null;
                if (isGroup) {
                    if (objData.objects && Array.isArray(objData.objects)) {
                        // КРИТИЧНО: Проверяем с учетом регистра (Image, image, IMAGE)
                        // Также проверяем наличие src, так как изображения должны иметь src
                        // Также проверяем наличие _src (внутреннее свойство Fabric.js)
                        // Также проверяем наличие URL (начинается с /media/ или http)
                        imageInGroup = objData.objects.find(obj => {
                            const objType = (obj.type || '').toLowerCase();
                            const objClassName = (obj.className || '').toLowerCase();
                            const hasImageType = objType === 'image' || objClassName === 'image';
                            const hasSrc = !!(obj.src || obj._src || obj._imageUrl);
                            // Проверяем, является ли src URL (начинается с /media/ или http)
                            const hasUrlSrc = !!(obj.src && (obj.src.startsWith('/media/') || obj.src.startsWith('http://') || obj.src.startsWith('https://')));
                            // Также проверяем наличие больших строковых полей, которые могут быть base64 изображениями
                            const hasLargeStringField = Object.keys(obj).some(key => {
                                const value = obj[key];
                                return typeof value === 'string' && value.length > 1000 && value.startsWith('data:image');
                            });
                            return hasImageType || hasSrc || hasUrlSrc || hasLargeStringField; // Если есть src (URL или base64) или большая строка с data:image, это может быть изображение
                        });
                }
                
                // КРИТИЧНО: Обрабатываем изображения отдельно от других объектов
                // ДОБАВЛЯЕМ ЛОГИРОВАНИЕ ПЕРЕД ПРОВЕРКОЙ
                console.log('[Whiteboard] 🔍 Checking if object is image:', {
                    isImage: isImage,
                    isImageType: isImageType,
                    isExplicitImage: isExplicitImage,
                    hasUrlSrc: hasUrlSrc,
                    objType: objData.type,
                    objTypeLower: objTypeLower,
                    imageInGroup: !!imageInGroup,
                    willProcess: isImage || imageInGroup
                });
                
                if (isImage || imageInGroup) {
                    console.log('[Whiteboard] ✅ Object WILL BE PROCESSED as image');
                    // ===== ЛОГИРОВАНИЕ ДЛЯ ДИАГНОСТИКИ =====
                    console.log('[Whiteboard] ✅ Processing image object:', {
                        isImage: isImage,
                        imageInGroup: !!imageInGroup,
                        objType: objData.type,
                        hasSrc: !!objData.src,
                        srcLength: objData.src ? objData.src.length : 0,
                        srcPreview: objData.src ? objData.src.substring(0, 100) : 'none',
                        from: data.from
                    });
                    
                    // Используем изображение из группы, если оно есть
                    let imageData = imageInGroup || objData;
                    
                    // КРИТИЧНО: Если imageData равен objData, создаем копию, чтобы не изменять оригинал
                    if (imageData === objData) {
                        imageData = { ...objData };
                    }
                    
                    // КРИТИЧНО: Копируем все свойства из objData в imageData, чтобы не потерять данные
                    // Это важно для правильной синхронизации изображений
                    // КРИТИЧНО: Копируем ВСЕ свойства из objData, включая src
                    // Это гарантирует, что правильные значения будут использованы
                    Object.keys(objData).forEach(key => {
                        if (key !== 'objects') {
                            // Копируем все свойства, приоритет objData
                            imageData[key] = objData[key];
                        }
                    });
                    
                    // КРИТИЧНО: ВСЕГДА копируем src из objData, если он есть (приоритет objData.src)
                    // Это критично, так как objData.src - это основной источник URL изображения
                    if (objData.src) {
                        imageData.src = objData.src;
                    } else if (imageInGroup && imageInGroup.src) {
                        // Если src нет в objData, но есть в imageInGroup, используем его
                        imageData.src = imageInGroup.src;
                    }
                    
                    // КРИТИЧНО: Преобразуем относительный путь в полный URL
                    // Сервер может отправлять относительный путь типа /media/whiteboard/TEST2/..., 
                    // но браузеру нужен полный URL для загрузки изображения
                    if (imageData.src && imageData.src.startsWith('/') && !imageData.src.startsWith('//')) {
                        imageData.src = window.location.origin + imageData.src;
                    }
                    
                    // ===== ЛОГИРОВАНИЕ ДЛЯ ДИАГНОСТИКИ =====
                    console.log('[Whiteboard] After copying properties:', {
                        hasSrc: !!imageData.src,
                        srcLength: imageData.src ? imageData.src.length : 0,
                        srcPreview: imageData.src ? imageData.src.substring(0, 100) : 'none'
                    });
                    
                    // КРИТИЧНО: Убеждаемся, что type установлен как 'image'
                    if (!imageData.type) {
                        imageData.type = 'image';
                    }
                    
                    // КРИТИЧНО: Если это простой объект типа 'image' (не в группе) с src, загружаем сразу
                    // Это нужно для случаев, когда объект не попадает в другие блоки обработки
                    // КРИТИЧНО: Проверяем явно по типу 'image' (независимо от регистра)
                    const isImageTypeCheck2 = imageData.type === 'image' || imageData.type === 'Image' || imageData.type === 'IMAGE' || isImageType || isExplicitImage;
                    if (!imageInGroup && imageData.src && isImageTypeCheck2 && data.from !== 'system') {
                        if (!this.isActive) {
                            // Если доска не активна, добавляем в очередь
                            this.pendingImages.push(imageData);
                            this.isDrawing = wasDrawing;
                            return;
                        }
                        
                        console.log('[Whiteboard] 🚀 Calling _loadImageToCanvas (simple image object):', {
                            id: imageData.id,
                            src: imageData.src,
                            type: imageData.type,
                            isExplicitImage: isExplicitImage
                        });
                        this.isDrawing = wasDrawing;
                        this._loadImageToCanvas(imageData, (success) => {
                            console.log('[Whiteboard] Image load callback, success:', success);
                            this.isDrawing = wasDrawing;
                        });
                        return; // Выходим, так как изображение загружается асинхронно
                    }
                    
                    // КРИТИЧНО: Если src отсутствует, пытаемся найти его в других полях
                    if (!imageData.src) {
                        // Проверяем _imageUrl, _src (внутренние свойства Fabric.js)
                        if (imageData._imageUrl) {
                            imageData.src = imageData._imageUrl;
                        } else if (imageData._src) {
                            imageData.src = imageData._src;
                            const srcInfo = imageData.src.startsWith('http://') || imageData.src.startsWith('https://') || imageData.src.startsWith('/') ? 
                                `URL: ${imageData.src}` : 
                                `base64 length: ${imageData.src.length}`;
                        } else {
                            // Ищем большие строковые поля, которые могут быть base64 изображениями или URL
                            const srcCandidate = Object.keys(imageData).find(key => {
                                const value = imageData[key];
                                if (typeof value === 'string') {
                                    // Проверяем URL
                                    if (value.startsWith('/media/') || value.startsWith('http://') || value.startsWith('https://')) {
                                        return true;
                                    }
                                    // Проверяем base64
                                    if (value.length > 1000 && value.startsWith('data:image')) {
                                        return true;
                                    }
                                }
                                return false;
                            });
                            if (srcCandidate) {
                                imageData.src = imageData[srcCandidate];
                                const srcInfo = imageData.src.startsWith('http://') || imageData.src.startsWith('https://') || imageData.src.startsWith('/') ? 
                                    `URL: ${imageData.src}` : 
                                    `base64 length: ${imageData.src.length}`;
                            }
                        }
                    }
                    
                    if (!imageData.src) {
                        // КРИТИЧНО: Если это Group без src, но с изображением внутри, попробуем извлечь src из объекта в Group
                        if (isGroup && imageInGroup && !imageInGroup.src) {
                            // Попробуем найти src в других полях imageInGroup
                            // Проверяем _imageUrl, _src
                            if (imageInGroup._imageUrl) {
                                imageData.src = imageInGroup._imageUrl;
                            } else if (imageInGroup._src) {
                                imageData.src = imageInGroup._src;
                                const srcInfo = imageData.src.startsWith('http://') || imageData.src.startsWith('https://') || imageData.src.startsWith('/') ? 
                                    `URL: ${imageData.src}` : 
                                    `base64 length: ${imageData.src.length}`;
                            } else {
                                // Ищем большие строковые поля или URL
                                const srcInGroup = Object.keys(imageInGroup).find(key => {
                                    const value = imageInGroup[key];
                                    if (typeof value === 'string') {
                                        // Проверяем URL
                                        if (value.startsWith('/media/') || value.startsWith('http://') || value.startsWith('https://')) {
                                            return true;
                                        }
                                        // Проверяем base64
                                        if (value.length > 1000 && value.startsWith('data:image')) {
                                            return true;
                                        }
                                    }
                                    return false;
                                });
                                if (srcInGroup) {
                                    imageData.src = imageInGroup[srcInGroup];
                                    const srcInfo = imageData.src.startsWith('http://') || imageData.src.startsWith('https://') || imageData.src.startsWith('/') ? 
                                        `URL: ${imageData.src}` : 
                                        `base64 length: ${imageData.src.length}`;
                                }
                            }
                        }
                        
                        // Если все еще нет src, не обрабатываем изображение
                        if (!imageData.src) {
                        this.isDrawing = wasDrawing;
                        return;
                        }
                    }
                    
                    
                    // Если изображение было в группе, создаем объект изображения с позицией группы
                    if (imageInGroup) {
                        const finalImageData = {
                            ...imageData,
                            id: imageData.id || objData.id,
                            left: objData.left || imageData.left || 0,
                            top: objData.top || imageData.top || 0,
                            scaleX: objData.scaleX || imageData.scaleX || 1,
                            scaleY: objData.scaleY || imageData.scaleY || 1,
                            angle: objData.angle || imageData.angle || 0,
                            opacity: objData.opacity !== undefined ? objData.opacity : (imageData.opacity !== undefined ? imageData.opacity : 1)
                        };
                        
                        // Если доска открыта, загружаем сразу, иначе в очередь
                        if (!this.isActive) {
                            this.pendingImages.push(finalImageData);
                            this.isDrawing = wasDrawing;
                            return;
                        }
                        
                        // КРИТИЧНО: Сбрасываем флаг isDrawing СРАЗУ, до загрузки изображения, чтобы не блокировать события рисования
                        this.isDrawing = wasDrawing;
                        console.log('[Whiteboard] 🎯 Calling _loadImageToCanvas (from image processing)');
                        this._loadImageToCanvas(finalImageData);
                        return;
                    }
                    
                    // КРИТИЧНО: Убеждаемся, что imageData имеет все необходимые свойства
                    // Копируем свойства из objData, если они отсутствуют в imageData
                    if (!imageData.id && objData.id) {
                        imageData.id = objData.id;
                    }
                    // КРИТИЧНО: Копируем src из objData, если его нет в imageData
                    if (!imageData.src && objData.src) {
                        imageData.src = objData.src;
                    }
                    if (!imageData.left && objData.left !== undefined) {
                        imageData.left = objData.left;
                    }
                    if (!imageData.top && objData.top !== undefined) {
                        imageData.top = objData.top;
                    }
                    if (!imageData.scaleX && objData.scaleX !== undefined) {
                        imageData.scaleX = objData.scaleX;
                    }
                    if (!imageData.scaleY && objData.scaleY !== undefined) {
                        imageData.scaleY = objData.scaleY;
                    }
                    if (!imageData.angle && objData.angle !== undefined) {
                        imageData.angle = objData.angle;
                    }
                    if (imageData.opacity === undefined && objData.opacity !== undefined) {
                        imageData.opacity = objData.opacity;
                    }
                    
                    // КРИТИЧНО: Убеждаемся, что imageData имеет src перед обработкой
                    // ВСЕГДА копируем src из objData, если он есть (приоритет objData.src)
                    if (objData.src) {
                        imageData.src = objData.src;
                    }
                    
                    // Если src все еще отсутствует, не обрабатываем изображение
                    if (!imageData.src) {
                        this.isDrawing = wasDrawing;
                        return; // Не обрабатываем изображение без src
                    }
                    
                    // Если это системное сообщение для синхронизации состояния - добавляем в очередь
                    if (data.from === 'system') {
                        this.pendingImages.push(imageData);
                        // Если доска уже открыта, начинаем загрузку
                        if (this.isActive) {
                            this._loadNextImage();
                        }
                        // КРИТИЧНО: Убеждаемся, что canvas остается интерактивным после системных сообщений
                        this.isDrawing = false;
                        if (this.canvas) {
                            this.canvas.selection = true;
                            this.canvas.interactive = true;
                        }
                        return;
                    }
                    
                    // Для обычных сообщений от других пользователей - загружаем сразу (если доска открыта)
                    if (!this.isActive) {
                        this.pendingImages.push(imageData);
                        this.isDrawing = wasDrawing;
                        return;
                    }
                    
                    // Загружаем изображение сразу (без callback, так как это не из очереди)
                    // КРИТИЧНО: Сбрасываем флаг isDrawing СРАЗУ, до загрузки изображения, чтобы не блокировать события рисования
                    this.isDrawing = wasDrawing;
                    console.log('[Whiteboard] 🎯 Calling _loadImageToCanvas (from image processing - else block)');
                    this._loadImageToCanvas(imageData);
                    return;
                } else {
                    // КРИТИЧНО: Явная проверка для объектов типа 'image', которые не попали в основной блок обработки
                    // Это может произойти, если объект имеет тип 'image', но не прошел проверку isImage
                    console.log('[Whiteboard] ⚠️ Object did NOT enter image processing block, checking if it should:', {
                        objType: objData.type,
                        isImageType: isImageType,
                        isExplicitImage: isExplicitImage,
                        hasUrlSrc: hasUrlSrc,
                        hasSrc: !!objData.src
                    });
                    
                    // КРИТИЧНО: Проверяем явно по типу 'image' (независимо от регистра)
                    // Также проверяем наличие src в разных полях
                    const isImageTypeCheck = isImageType || objData.type === 'image' || objData.type === 'Image' || objData.type === 'IMAGE';
                    const hasSrcDirect = !!objData.src;
                    const hasSrcInFields = !!(objData._src || objData._imageUrl);
                    const hasSrcAnywhere = hasSrcDirect || hasSrcInFields;
                    
                    if (isImageTypeCheck && hasSrcAnywhere) {
                        console.log('[Whiteboard] ⚠️ Image object not processed in main block, processing in else block');
                        const imageData = { ...objData };
                        
                        // КРИТИЧНО: Ищем src в разных полях, если его нет напрямую
                        if (!imageData.src) {
                            imageData.src = objData._imageUrl || objData._src || objData.src;
                        }
                        
                        // КРИТИЧНО: Преобразуем относительный путь в полный URL
                        if (imageData.src && imageData.src.startsWith('/') && !imageData.src.startsWith('//')) {
                            imageData.src = window.location.origin + imageData.src;
                        }
                        imageData.type = 'image';
                        
                        // Если это системное сообщение для синхронизации состояния - добавляем в очередь
                        if (data.from === 'system') {
                            this.pendingImages.push(imageData);
                            if (this.isActive) {
                                this._loadNextImage();
                            }
                            this.isDrawing = false;
                            if (this.canvas) {
                                this.canvas.selection = true;
                                this.canvas.interactive = true;
                            }
                            return;
                        }
                        
                        // Для обычных сообщений от других пользователей - загружаем сразу (если доска открыта)
                        if (!this.isActive) {
                            this.pendingImages.push(imageData);
                            this.isDrawing = wasDrawing;
                            return;
                        }
                        
                        // Загружаем изображение сразу
                        this.isDrawing = wasDrawing;
                        console.log('[Whiteboard] 🎯 Calling _loadImageToCanvas (from else block - explicit image)');
                        this._loadImageToCanvas(imageData);
                        return;
                    }
                    
                    // КРИТИЧНО: Проверяем, не является ли объект изображением, которое не было определено ранее
                    // Если объект имеет src с URL, но не был определен как изображение, обрабатываем его как изображение
                    const hasUrlSrc = !!(objData.src && (objData.src.startsWith('/media/') || objData.src.startsWith('http://') || objData.src.startsWith('https://')));
                    if (hasUrlSrc) {
                        // Это изображение, обрабатываем его как изображение
                        // КРИТИЧНО: Копируем все свойства из objData, чтобы не потерять данные
                        const imageData = { ...objData };
                        // КРИТИЧНО: Убеждаемся, что src скопирован правильно
                        if (objData.src) {
                            imageData.src = objData.src;
                        }
                        // КРИТИЧНО: Преобразуем относительный путь в полный URL
                        // Сервер может отправлять относительный путь типа /media/whiteboard/TEST2/..., 
                        // но браузеру нужен полный URL для загрузки изображения
                        if (imageData.src && imageData.src.startsWith('/') && !imageData.src.startsWith('//')) {
                            imageData.src = window.location.origin + imageData.src;
                        }
                        // КРИТИЧНО: Убеждаемся, что type установлен как 'image'
                        imageData.type = 'image';
                        
                        // Если это системное сообщение для синхронизации состояния - добавляем в очередь
                        if (data.from === 'system') {
                            this.pendingImages.push(imageData);
                            // Если доска уже открыта, начинаем загрузку
                            if (this.isActive) {
                                this._loadNextImage();
                            }
                            // КРИТИЧНО: Убеждаемся, что canvas остается интерактивным после системных сообщений
                            this.isDrawing = false;
                            if (this.canvas) {
                                this.canvas.selection = true;
                                this.canvas.interactive = true;
                            }
                            return;
                        }
                        
                        // Для обычных сообщений от других пользователей - загружаем сразу (если доска открыта)
                        if (!this.isActive) {
                            this.pendingImages.push(imageData);
                            this.isDrawing = wasDrawing;
                            return;
                        }
                        
                        // Загружаем изображение сразу
                        this.isDrawing = wasDrawing;
                        console.log('[Whiteboard] 🎯 Calling _loadImageToCanvas (from hasUrlSrc block)');
                        this._loadImageToCanvas(imageData);
                        return;
                    }
                    
                    // Для других объектов (не изображений) - загружаем сразу, они легкие
                    // Для системных сообщений тоже загружаем сразу (это восстановление состояния)
                    fabric.util.enlivenObjects([objData], (objects) => {
                        if (!objects || objects.length === 0) {
                            return;
                        }
                        
                        // КРИТИЧНО: Для системных сообщений не устанавливаем isDrawing, чтобы не блокировать события рисования
                        const wasDrawing = this.isDrawing;
                        if (data.from !== 'system') {
                        this.isDrawing = true;
                        }
                        
                        try {
                            objects.forEach(obj => {
                                // Убеждаемся, что у объекта есть ID
                                if (!obj.id && objData.id) {
                                    obj.id = objData.id;
                                } else if (!obj.id) {
                                    obj.id = `${data.from}-${Date.now()}-${Math.random()}`;
                                }
                                
                                // Проверяем, не существует ли уже объект с таким ID
                                const existingObj = this.canvas.getObjects().find(o => o.id === obj.id);
                                if (!existingObj) {
                                    this.canvas.add(obj);
                                }
                            });
                            
                            // Восстанавливаем флаг и рендерим
                            this.isDrawing = wasDrawing;
                            // КРИТИЧНО: Для системных сообщений убеждаемся, что canvas остается интерактивным
                            if (data.from === 'system') {
                                this.isDrawing = false;
                                if (this.canvas) {
                                    this.canvas.selection = true;
                                    this.canvas.interactive = true;
                                }
                            }
                            try {
                                this.canvas.renderAll();
                            } catch (renderError) {
                                // Пытаемся очистить поврежденные объекты
                                try {
                                    const objects = this.canvas.getObjects();
                                    const validObjects = objects.filter(obj => obj && typeof obj.render === 'function');
                                    this.canvas.clear();
                                    validObjects.forEach(obj => {
                                        try {
                                            this.canvas.add(obj);
                                        } catch (e) {
                                        }
                                    });
                                    this.canvas.renderAll();
                                } catch (cleanupError) {
                                }
                            }
                        } catch (addError) {
                            this.isDrawing = wasDrawing;
                            // КРИТИЧНО: Для системных сообщений убеждаемся, что canvas остается интерактивным
                            if (data.from === 'system') {
                                this.isDrawing = false;
                                if (this.canvas) {
                                    this.canvas.selection = true;
                                    this.canvas.interactive = true;
                                }
                            }
                        }
                    }, 'fabric', (err) => {
                        // КРИТИЧНО: Для системных сообщений убеждаемся, что canvas остается интерактивным
                        if (data.from === 'system') {
                        this.isDrawing = false;
                            if (this.canvas) {
                                this.canvas.selection = true;
                                this.canvas.interactive = true;
                            }
                        } else {
                            this.isDrawing = false;
                        }
                    });
                }
            }
            
            // КРИТИЧНО: Логируем сразу после закрытия блока if (eventType === 'object-added')
            console.log('[Whiteboard] 🔍 After if (eventType === "object-added") block:', {
                eventType: eventType,
                isObjectAdded: eventType === 'object-added',
                isObjectModified: eventType === 'object-modified',
                isObjectMoving: eventType === 'object-moving',
                isObjectScaling: eventType === 'object-scaling'
            });
            
            // КРИТИЧНО: Логируем перед проверкой событий модификации
            console.log('[Whiteboard] 🔍 Before checking modification events:', {
                eventType: eventType,
                isObjectAdded: eventType === 'object-added',
                isObjectModified: eventType === 'object-modified',
                isObjectMoving: eventType === 'object-moving',
                isObjectScaling: eventType === 'object-scaling',
                willEnterModificationBlock: (eventType === 'object-modified' || eventType === 'object-moving' || eventType === 'object-scaling')
            });
            
            if (eventType === 'object-modified' || eventType === 'object-moving' || eventType === 'object-scaling') {
                console.log('[Whiteboard] 🎯 ENTERED object-modified/moving/scaling block', {
                    eventType: eventType,
                    hasObjData: !!objData,
                    objDataId: objData?.id,
                    objDataType: objData?.type
                });
                // КРИТИЧНО: Для изображений ищем по ID, но также проверяем тип
                const objTypeLower = (objData.type || '').toLowerCase();
                const isImage = objTypeLower === 'image';
                
                console.log('[Whiteboard] 📥 Received object-modified:', {
                    id: objData.id,
                    type: objData.type,
                    isImage: isImage,
                    left: objData.left,
                    top: objData.top,
                    scaleX: objData.scaleX,
                    scaleY: objData.scaleY,
                    angle: objData.angle,
                    from: data.from
                });
                
                // Ищем объект по ID, но также проверяем, не обернут ли он в Group
                let obj = this.canvas.getObjects().find(o => o.id === objData.id);
                
                // Если объект не найден напрямую, проверяем Group
                if (!obj && isImage) {
                    const groupWithImage = this.canvas.getObjects().find(o => {
                        if (o.type === 'group' && o.getObjects) {
                            const imageInGroup = o.getObjects().find(img => img.id === objData.id && img.type === 'image');
                            return !!imageInGroup;
                        }
                        return false;
                    });
                    
                    if (groupWithImage) {
                        obj = groupWithImage.getObjects().find(img => img.id === objData.id && img.type === 'image');
                    }
                }
                
                if (obj) {
                    console.log('[Whiteboard] ✅ Found object to update:', {
                        id: obj.id,
                        type: obj.type,
                        currentLeft: obj.left,
                        currentTop: obj.top,
                        currentScaleX: obj.scaleX,
                        currentScaleY: obj.scaleY,
                        newLeft: objData.left,
                        newTop: objData.top,
                        newScaleX: objData.scaleX,
                        newScaleY: objData.scaleY
                    });
                    
                    // Обновляем свойства объекта
                    // Для изображений обновляем только позицию и масштаб, не трогаем src
                    if (isImage) {
                        const updateData = {
                            left: objData.left,
                            top: objData.top,
                            scaleX: objData.scaleX,
                            scaleY: objData.scaleY,
                            angle: objData.angle,
                            opacity: objData.opacity !== undefined ? objData.opacity : 1
                        };
                        obj.set(updateData);
                        obj.setCoords(); // Обновляем координаты для правильного отображения
                        this.canvas.renderAll();
                        console.log('[Whiteboard] ✅ Image updated successfully');
                    } else {
                        obj.set(objData);
                        obj.setCoords();
                    this.canvas.renderAll();
                    }
                    
                    // КРИТИЧНО: Флаг isDrawing не устанавливался для object-modified, так что не нужно его сбрасывать
                    // Но на всякий случай убеждаемся, что он сброшен
                    this.isDrawing = wasDrawing;
                } else {
                    console.warn('[Whiteboard] ⚠️ Object not found for modification:', {
                        id: objData.id,
                        type: objData.type,
                        isImage: isImage,
                        totalObjects: this.canvas.getObjects().length,
                        objectIds: this.canvas.getObjects().map(o => o.id)
                    });
                    // Если объект не найден, добавляем его (особенно важно для изображений)
                    if (isImage && objData.src) {
                        // Для изображений используем специальную функцию загрузки
                        console.log('[Whiteboard] 🎯 Calling _loadImageToCanvas (from object-modified handler)');
                        this._loadImageToCanvas(objData);
                    } else {
                    fabric.util.enlivenObjects([objData], (objects) => {
                        if (objects && objects.length > 0) {
                            objects.forEach(obj => {
                                    if (!obj.id && objData.id) {
                                        obj.id = objData.id;
                                    }
                                this.canvas.add(obj);
                            });
                            this.canvas.renderAll();
                        }
                            // КРИТИЧНО: Флаг isDrawing не устанавливался для object-modified, так что не нужно его сбрасывать
                            // Но на всякий случай убеждаемся, что он сброшен
                            this.isDrawing = wasDrawing;
                    }, 'fabric');
                    }
                }
            } else if (eventType === 'object-removed') {
                // Улучшенная обработка удаления объектов
                // При 3+ пользователях объекты могут удаляться до того, как были добавлены
                if (!objData) {
                    this.isDrawing = wasDrawing;
                    return;
                }
                
                if (!objData.id) {
                    this.isDrawing = wasDrawing;
                    return;
                }
                
                
                const obj = this.canvas.getObjects().find(o => o && o.id === objData.id);
                if (obj) {
                    try {
                        this.canvas.remove(obj);
                        this.canvas.renderAll();
                    } catch (e) {
                        // Ошибка при удалении объекта
                    }
                } else {
                    // Объект не найден - это нормально, если он был удален ранее или еще не добавлен
                }
                }
            }
        } catch (error) {
            // Ошибка обработана
        } finally {
            // КРИТИЧНО: Сбрасываем флаг isDrawing сразу, чтобы не блокировать события рисования
            // Для системных сообщений (восстановление состояния) флаг не устанавливался, но убеждаемся что он сброшен
            // Для object-modified флаг уже сброшен выше, но на всякий случай сбрасываем еще раз
            if (data.from === 'system') {
                // Для системных сообщений флаг не устанавливался, но убеждаемся что он сброшен
                this.isDrawing = false;
                // КРИТИЧНО: Убеждаемся, что canvas остается интерактивным после восстановления состояния
                if (this.canvas) {
                    this.canvas.selection = true;
                    this.canvas.interactive = true;
                }
            } else if (eventType === 'object-modified' || eventType === 'object-moving' || eventType === 'object-scaling') {
                // Флаг уже сброшен выше, но убеждаемся что он сброшен
                    this.isDrawing = wasDrawing;
            } else if (eventType !== 'object-removed') {
                // Для других событий сбрасываем сразу, без задержки
                this.isDrawing = wasDrawing;
            } else {
                // Для удаления не меняем флаг (он не устанавливался)
                this.isDrawing = wasDrawing;
            }
        }
    }
    
    // Специальный обработчик для системных сообщений
    _handleSystemMessage(data) {
        console.log('[Whiteboard] 🔄 Processing SYSTEM message for state restoration:', {
            eventType: data.data?.eventType,
            objType: data.data?.object?.type,
            objId: data.data?.object?.id
        });

        if (!data.data || !data.data.eventType) {
            return;
        }

        const { eventType, object } = data.data;

        // Для системных сообщений ВСЕГДА обрабатываем изображения немедленно
        if (this._isImageObject(object)) {
            console.log('[Whiteboard] 🖼️ SYSTEM: Image object detected, loading immediately');
            
            // Помечаем объект как системный для принудительной загрузки
            object._isSystem = true;
            object.from = 'system';
            
            // Принудительно загружаем изображение, даже если доска не активна
            if (!this.isActive) {
                console.log('[Whiteboard] ⚡ SYSTEM: Whiteboard not active, forcing image load anyway');
                this._loadImageToCanvas(object, (success) => {
                    if (success) {
                        console.log('[Whiteboard] ✅ SYSTEM: Image loaded successfully during state restoration');
                    } else {
                        console.error('[Whiteboard] ❌ SYSTEM: Failed to load image during state restoration');
                    }
                });
            } else {
                // Используем унифицированный обработчик, но с системным флагом
                this._handleImageEvent(eventType, object, 'system');
            }
            return;
        }

        // Для не-изображений используем стандартную обработку
        // Временно устанавливаем флаг, чтобы не отправлять события обратно
        const wasDrawing = this.isDrawing;
        
        // Для системных сообщений не устанавливаем isDrawing, чтобы не блокировать события
        this.isDrawing = false;
        
        try {
            if (eventType === 'object-added') {
                // Используем существующую логику для не-изображений
                fabric.util.enlivenObjects([object], (objects) => {
                    if (!objects || objects.length === 0) {
                        this.isDrawing = wasDrawing;
                        return;
                    }
                    
                    try {
                        objects.forEach(obj => {
                            if (!obj.id && object.id) {
                                obj.id = object.id;
                            } else if (!obj.id) {
                                obj.id = `system-${Date.now()}-${Math.random()}`;
                            }
                            
                            const existingObj = this.canvas.getObjects().find(o => o.id === obj.id);
                            if (!existingObj) {
                                this.canvas.add(obj);
                            }
                        });
                        
                        this.isDrawing = false;
                        if (this.canvas) {
                            this.canvas.selection = true;
                            this.canvas.interactive = true;
                        }
                        this.canvas.renderAll();
                    } catch (addError) {
                        this.isDrawing = wasDrawing;
                    }
                }, 'fabric', (err) => {
                    this.isDrawing = false;
                    if (this.canvas) {
                        this.canvas.selection = true;
                        this.canvas.interactive = true;
                    }
                });
            } else if (eventType === 'object-removed') {
                if (object && object.id) {
                    const obj = this.canvas.getObjects().find(o => o && o.id === object.id);
                    if (obj) {
                        try {
                            this.canvas.remove(obj);
                            this.canvas.renderAll();
                        } catch (e) {
                            // Ошибка при удалении объекта
                        }
                    }
                }
                this.isDrawing = wasDrawing;
            } else if (eventType === 'object-modified' || eventType === 'object-moving' || eventType === 'object-scaling') {
                if (object && object.id) {
                    const obj = this.canvas.getObjects().find(o => o && o.id === object.id);
                    if (obj) {
                        try {
                            obj.set({
                                left: object.left,
                                top: object.top,
                                scaleX: object.scaleX,
                                scaleY: object.scaleY,
                                angle: object.angle,
                                opacity: object.opacity !== undefined ? object.opacity : 1
                            });
                            obj.setCoords();
                            this.canvas.renderAll();
                        } catch (e) {
                            // Ошибка при обновлении объекта
                        }
                    }
                }
                this.isDrawing = wasDrawing;
            }
        } catch (error) {
            console.error('[Whiteboard] ❌ Error processing system message:', error);
            this.isDrawing = wasDrawing;
        } finally {
            // Убеждаемся, что canvas остается интерактивным
            this.isDrawing = false;
            if (this.canvas) {
                this.canvas.selection = true;
                this.canvas.interactive = true;
            }
        }
    }
    
    // ===== УНИФИЦИРОВАННАЯ ОБРАБОТКА СОБЫТИЙ С ИЗОБРАЖЕНИЯМИ =====
    
    // Унифицированный обработчик для всех событий с изображениями
    _handleImageEvent(eventType, objData, fromUserId) {
        console.log('[Whiteboard] 🖼️ Handling image event:', {
            eventType: eventType,
            objId: objData.id,
            from: fromUserId,
            hasSrc: !!objData.src
        });

        switch (eventType) {
            case 'object-added':
                this._loadRemoteImage(objData, fromUserId);
                break;
                
            case 'object-modified':
            case 'object-moving':
            case 'object-scaling':
                this._updateRemoteImage(objData, fromUserId);
                break;
                
            case 'object-removed':
                this._removeRemoteImage(objData, fromUserId);
                break;
        }
    }

    // Загрузка удаленного изображения
    _loadRemoteImage(objData, fromUserId) {
        console.log('[Whiteboard] 📥 Loading remote image:', objData.id);
        
        // Проверяем, не существует ли уже изображение
        const existingImage = this.canvas.getObjects().find(obj => 
            obj.id === objData.id && obj.type === 'image'
        );
        
        if (existingImage) {
            console.log('[Whiteboard] ⚠️ Image already exists, updating instead');
            this._updateRemoteImage(objData, fromUserId);
            return;
        }
        
        // КРИТИЧНО: Для системных сообщений помечаем объект как системный
        if (fromUserId === 'system') {
            objData._isSystem = true;
            objData.from = 'system';
        }
        
        // Загружаем изображение
        this._loadImageToCanvas(objData, (success) => {
            if (success) {
                console.log('[Whiteboard] ✅ Remote image loaded successfully');
            } else {
                console.error('[Whiteboard] ❌ Failed to load remote image');
            }
        });
    }

    // Обновление удаленного изображения
    _updateRemoteImage(remoteObject, fromUserId) {
        console.log('[Whiteboard] 🔄 Updating remote image:', remoteObject.id);
        
        // Ищем изображение на canvas
        let targetImage = this.canvas.getObjects().find(obj => 
            obj.id === remoteObject.id && obj.type === 'image'
        );
        
        // Если изображение не найдено, проверяем группы
        if (!targetImage) {
            const groupWithImage = this.canvas.getObjects().find(obj => 
                obj.type === 'group' && obj.getObjects && 
                obj.getObjects().some(img => img.id === remoteObject.id && img.type === 'image')
            );
            
            if (groupWithImage) {
                targetImage = groupWithImage.getObjects().find(img => 
                    img.id === remoteObject.id && img.type === 'image'
                );
                
                // Если нашли в группе, извлекаем из группы
                if (targetImage) {
                    this._extractImageFromGroup(groupWithImage, targetImage, remoteObject);
                    return;
                }
            }
        }
        
        if (!targetImage) {
            console.warn('[Whiteboard] ⚠️ Image not found for update, loading as new:', remoteObject.id);
            this._loadRemoteImage(remoteObject, fromUserId);
            return;
        }
        
        // Временно отключаем события canvas чтобы избежать рекурсии
        this._disableCanvasEvents();
        
        try {
            // Обновляем свойства изображения
            const updateProps = {
                left: remoteObject.left,
                top: remoteObject.top,
                scaleX: remoteObject.scaleX,
                scaleY: remoteObject.scaleY,
                angle: remoteObject.angle,
                opacity: remoteObject.opacity !== undefined ? remoteObject.opacity : 1
            };
            
            console.log('[Whiteboard] 📊 Updating image properties:', updateProps);
            
            targetImage.set(updateProps);
            targetImage.setCoords();
            
            // Принудительно рендерим canvas
            this.canvas.renderAll();
            
            console.log('[Whiteboard] ✅ Remote image updated successfully');
        } catch (error) {
            console.error('[Whiteboard] ❌ Error updating remote image:', error);
        } finally {
            // Восстанавливаем события
            this._enableCanvasEvents();
        }
    }

    // Удаление удаленного изображения
    _removeRemoteImage(objData, fromUserId) {
        console.log('[Whiteboard] 🗑️ Removing remote image:', objData.id);
        
        // Ищем изображение
        let targetImage = this.canvas.getObjects().find(obj => 
            obj.id === objData.id && obj.type === 'image'
        );
        
        // Проверяем группы
        if (!targetImage) {
            const groupWithImage = this.canvas.getObjects().find(obj => 
                obj.type === 'group' && obj.getObjects && 
                obj.getObjects().some(img => img.id === objData.id && img.type === 'image')
            );
            
            if (groupWithImage) {
                targetImage = groupWithImage.getObjects().find(img => 
                    img.id === objData.id && img.type === 'image'
                );
            }
        }
        
        if (targetImage) {
            this.canvas.remove(targetImage);
            this.canvas.renderAll();
            console.log('[Whiteboard] ✅ Remote image removed');
        } else {
            console.warn('[Whiteboard] ⚠️ Image not found for removal:', objData.id);
        }
    }

    // Извлечение изображения из группы
    _extractImageFromGroup(group, image, remoteObject) {
        console.log('[Whiteboard] 🔄 Extracting image from group:', image.id);
        
        this._disableCanvasEvents();
        
        try {
            // Получаем абсолютные координаты изображения в группе
            const groupLeft = group.left || 0;
            const groupTop = group.top || 0;
            const groupScaleX = group.scaleX || 1;
            const groupScaleY = group.scaleY || 1;
            const groupAngle = group.angle || 0;
            
            // Вычисляем абсолютные координаты
            const absoluteLeft = groupLeft + (image.left || 0) * groupScaleX;
            const absoluteTop = groupTop + (image.top || 0) * groupScaleY;
            const absoluteScaleX = (image.scaleX || 1) * groupScaleX;
            const absoluteScaleY = (image.scaleY || 1) * groupScaleY;
            const absoluteAngle = (image.angle || 0) + groupAngle;
            
            // Устанавливаем абсолютные координаты
            image.set({
                left: absoluteLeft,
                top: absoluteTop,
                scaleX: absoluteScaleX,
                scaleY: absoluteScaleY,
                angle: absoluteAngle,
                selectable: true,
                evented: true,
                hasControls: true,
                hasBorders: true
            });
            
            // Удаляем группу и добавляем изображение отдельно
            this.canvas.remove(group);
            this.canvas.add(image);
            this.canvas.renderAll();
            
            console.log('[Whiteboard] ✅ Image extracted from group');
        } catch (error) {
            console.error('[Whiteboard] ❌ Error extracting image from group:', error);
        } finally {
            this._enableCanvasEvents();
        }
    }

    // Вспомогательные методы для управления событиями canvas
    _disableCanvasEvents() {
        // Временно отключаем события canvas, чтобы избежать рекурсии при обновлении изображений
        // События будут автоматически восстановлены, так как они привязаны через this.canvas.on()
        // Мы просто временно блокируем их выполнение через флаг isDrawing
        this.isDrawing = true;
    }

    _enableCanvasEvents() {
        // Восстанавливаем события через небольшую задержку
        setTimeout(() => {
            // Сбрасываем флаг isDrawing, чтобы события снова работали
            this.isDrawing = false;
            // Убеждаемся, что canvas интерактивен
            if (this.canvas) {
                this.canvas.selection = true;
                this.canvas.interactive = true;
            }
        }, 50);
    }

    // Проверка, является ли объект изображением
    _isImageObject(obj) {
        if (!obj) return false;
        
        const type = (obj.type || '').toLowerCase();
        const className = (obj.className || '').toLowerCase();
        
        // Проверяем тип
        if (type === 'image') return true;
        
        // Проверяем наличие src
        if (obj.src || obj._src || obj._imageUrl) return true;
        
        // Проверяем группы на наличие изображений
        if (type === 'group' && obj.objects && Array.isArray(obj.objects)) {
            return obj.objects.some(item => this._isImageObject(item));
        }
        
        // Проверяем URL в src
        if (obj.src && (obj.src.startsWith('/media/') || 
            obj.src.startsWith('http://') || 
            obj.src.startsWith('https://'))) {
            return true;
        }
        
        return false;
    }

    // Специальный метод для отправки изменений изображений
    _sendImageModification(imageObj, eventType) {
        if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
            console.warn('[Whiteboard] ⚠️ WebSocket not ready, cannot send image modification');
            return;
        }
        
        // Подготавливаем данные изображения для отправки
        const imageUrl = imageObj._imageUrl || imageObj._src || (imageObj.getElement && imageObj.getElement() ? imageObj.getElement().src : null) || imageObj.src;
        
        if (!imageUrl) {
            console.warn('[Whiteboard] ⚠️ Image has no URL, cannot send modification');
            return;
        }
        
        const imageData = {
            type: 'image',
            id: imageObj.id,
            src: imageUrl,
            left: imageObj.left,
            top: imageObj.top,
            scaleX: imageObj.scaleX,
            scaleY: imageObj.scaleY,
            angle: imageObj.angle,
            opacity: imageObj.opacity !== undefined ? imageObj.opacity : 1,
            width: imageObj.width,
            height: imageObj.height
        };
        
        console.log(`[Whiteboard] 📤 Sending image ${eventType}:`, {
            id: imageData.id,
            position: { left: imageData.left, top: imageData.top },
            scale: { scaleX: imageData.scaleX, scaleY: imageData.scaleY }
        });
        
        const message = {
            type: 'whiteboard-object',
            room: this.roomName,
            from: this.userId,
            data: {
                eventType: eventType,
                object: imageData
            }
        };
        
        this.socket.send(JSON.stringify(message));
    }
    
    handleRemoteCursor(data) {
        if (data.from === this.userId) return;
        
        const userId = data.from;
        const pointer = data.data;
        
        if (pointer.x === null || pointer.y === null) {
            // Удаляем курсор, если пользователь вышел за пределы canvas
            this.removeCursor(userId);
            return;
        }
        
        this.updateCursor(userId, pointer.x, pointer.y);
    }
    
    updateCursor(userId, x, y) {
        // Удаляем старый курсор, если есть
        this.removeCursor(userId);
        
        // Создаем новый курсор
        const cursor = new fabric.Circle({
            left: x,
            top: y,
            radius: 5,
            fill: this.getUserColor(userId),
            originX: 'center',
            originY: 'center',
            selectable: false,
            evented: false,
            hasControls: false,
            hasBorders: false
        });
        
        // Добавляем имя пользователя
        const text = new fabric.Text(userId.substring(0, 6), {
            left: x + 10,
            top: y - 10,
            fontSize: 12,
            fill: this.getUserColor(userId),
            selectable: false,
            evented: false,
            hasControls: false,
            hasBorders: false
        });
        
        const group = new fabric.Group([cursor, text], {
            selectable: false,
            evented: false,
            hasControls: false,
            hasBorders: false
        });
        
        group.userId = userId;
        this.cursors[userId] = group;
        this.canvas.add(group);
        this.canvas.renderAll();
        
        // Автоматически удаляем курсор через 2 секунды без обновления
        setTimeout(() => {
            if (this.cursors[userId]) {
                this.removeCursor(userId);
            }
        }, 2000);
    }
    
    removeCursor(userId) {
        if (this.cursors[userId]) {
            this.canvas.remove(this.cursors[userId]);
            delete this.cursors[userId];
            this.canvas.renderAll();
        }
    }
    
    getUserColor(userId) {
        // Генерируем цвет на основе userId
        const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2'];
        const index = parseInt(userId) % colors.length;
        return colors[index];
    }
    
    // Инструменты
    setTool(tool) {
        this.currentTool = tool;
        
        switch (tool) {
            case 'brush':
                this.canvas.isDrawingMode = true;
                this.canvas.freeDrawingBrush.width = this.brushWidth;
                this.canvas.freeDrawingBrush.color = this.brushColor;
                break;
            case 'select':
                this.canvas.isDrawingMode = false;
                this.canvas.selection = true;
                break;
            case 'rectangle':
                this.canvas.isDrawingMode = false;
                this.addRectangle();
                break;
            case 'circle':
                this.canvas.isDrawingMode = false;
                this.addCircle();
                break;
            case 'line':
                this.canvas.isDrawingMode = false;
                this.addLine();
                break;
            case 'text':
                this.canvas.isDrawingMode = false;
                this.addText();
                break;
            case 'eraser':
                this.canvas.isDrawingMode = true;
                this.canvas.freeDrawingBrush.width = 20;
                this.canvas.freeDrawingBrush.color = '#ffffff';
                break;
        }
    }
    
    addRectangle() {
        const rect = new fabric.Rect({
            left: 100,
            top: 100,
            width: 100,
            height: 100,
            fill: this.fillColor,
            stroke: this.strokeColor,
            strokeWidth: 2,
            id: `${this.userId}-${Date.now()}-${Math.random()}`
        });
        
        this.canvas.add(rect);
        this.canvas.setActiveObject(rect);
    }
    
    addCircle() {
        const circle = new fabric.Circle({
            left: 100,
            top: 100,
            radius: 50,
            fill: this.fillColor,
            stroke: this.strokeColor,
            strokeWidth: 2,
            id: `${this.userId}-${Date.now()}-${Math.random()}`
        });
        
        this.canvas.add(circle);
        this.canvas.setActiveObject(circle);
    }
    
    addLine() {
        const line = new fabric.Line([50, 100, 200, 100], {
            stroke: this.strokeColor,
            strokeWidth: 2,
            id: `${this.userId}-${Date.now()}-${Math.random()}`
        });
        
        this.canvas.add(line);
        this.canvas.setActiveObject(line);
    }
    
    addText() {
        const text = new fabric.IText('Double click to edit', {
            left: 100,
            top: 100,
            fontSize: 20,
            fill: this.strokeColor,
            id: `${this.userId}-${Date.now()}-${Math.random()}`
        });
        
        this.canvas.add(text);
        this.canvas.setActiveObject(text);
    }
    
    // Загрузка изображения
    addImage(file) {
        if (!file || !file.type.startsWith('image/')) {
            return;
        }
        
        this.addImageFromFile(file);
    }
    
    // Сжатие изображения с использованием canvas
    async compressImage(file, maxWidth = 1200, maxHeight = 1200, quality = 0.8) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    // Вычисляем новые размеры с сохранением пропорций
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > maxWidth || height > maxHeight) {
                        const scale = Math.min(maxWidth / width, maxHeight / height);
                        width = Math.round(width * scale);
                        height = Math.round(height * scale);
                    }
                    
                    // Создаем canvas для сжатия
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    
                    // Рисуем изображение на canvas с сглаживанием
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    // Конвертируем в blob с заданным качеством
                    canvas.toBlob((blob) => {
                        if (blob) {
                            const compressedUrl = URL.createObjectURL(blob);
                            resolve({ blob, url: compressedUrl, width, height });
                        } else {
                            reject(new Error('Failed to compress image'));
                        }
                    }, file.type || 'image/jpeg', quality);
                };
                
                img.onerror = () => reject(new Error('Failed to load image'));
                img.src = e.target.result;
            };
            
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }
    
    // Показ индикатора загрузки
    showImageLoadingIndicator() {
        const canvas = this.canvas.getElement();
        const container = canvas.parentElement;
        
        // Создаем индикатор загрузки, если его еще нет
        let loader = container.querySelector('.image-loading-indicator');
        if (!loader) {
            loader = document.createElement('div');
            loader.className = 'image-loading-indicator';
            loader.innerHTML = `
                <div class="loading-spinner"></div>
                <div class="loading-text">Загрузка изображения...</div>
            `;
            container.appendChild(loader);
        }
        loader.style.display = 'flex';
    }
    
    // Скрытие индикатора загрузки
    hideImageLoadingIndicator() {
        const canvas = this.canvas.getElement();
        const container = canvas.parentElement;
        const loader = container.querySelector('.image-loading-indicator');
        if (loader) {
            loader.style.display = 'none';
        }
    }
    
    async addImageFromFile(file) {
        if (!file || !file.type.startsWith('image/')) {
            return Promise.reject(new Error('Invalid image file'));
        }
        
        
        // Показываем индикатор загрузки
        this.showImageLoadingIndicator();
        
        try {
            // Сжимаем изображение
            const { blob, url: compressedUrl, width: compressedWidth, height: compressedHeight } = await this.compressImage(file);
            
            // Загружаем изображение на сервер
            const formData = new FormData();
            formData.append('image', blob, file.name || 'image.png');
            formData.append('room_name', this.roomName);
            
            const uploadResponse = await fetch('/upload_whiteboard_image/', {
                method: 'POST',
                body: formData
            });
            
            if (!uploadResponse.ok) {
                const errorData = await uploadResponse.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(errorData.error || 'Failed to upload image');
            }
            
            const uploadData = await uploadResponse.json();
            let imageUrl = uploadData.url;
            
            // КРИТИЧНО: Преобразуем относительный путь в полный URL
            // Сервер возвращает относительный путь типа /media/whiteboard/TEST2/..., 
            // но браузеру нужен полный URL для загрузки изображения
            if (imageUrl && imageUrl.startsWith('/')) {
                // Используем window.location.origin для получения базового URL
                imageUrl = window.location.origin + imageUrl;
            }
            
            // Освобождаем память от compressedUrl
            URL.revokeObjectURL(compressedUrl);
            
            // Создаем HTMLImageElement из URL сервера
            return new Promise((resolve, reject) => {
                const htmlImg = new Image();
                htmlImg.crossOrigin = 'anonymous';
                
                htmlImg.onload = () => {
                    
                    try {
                        // Создаем fabric.Image напрямую из HTMLImageElement
                        const fabricImg = new fabric.Image(htmlImg);
                        
                        if (!fabricImg) {
                            this.hideImageLoadingIndicator();
                            reject(new Error('Failed to create fabric.Image'));
                            return;
                        }
                        
                        // НЕ устанавливаем isDrawing = true, так как изображение будет отправлено ДО добавления на canvas
                        // и мы не хотим блокировать события canvas
                        const wasDrawing = this.isDrawing;
                        
                        const imgId = `${this.userId}-${Date.now()}-${Math.random()}`;
                        
                        // Сохраняем URL сервера в объекте для синхронизации
                        fabricImg._src = imageUrl; // Сохраняем URL вместо base64
                        fabricImg._imageUrl = imageUrl; // Дополнительное поле для ясности
                                
                                // Устанавливаем размер изображения (максимум 800x600 для отображения)
                                const maxDisplayWidth = 800;
                                const maxDisplayHeight = 600;
                                let displayWidth = fabricImg.width || htmlImg.width;
                                let displayHeight = fabricImg.height || htmlImg.height;
                                
                                if (displayWidth > maxDisplayWidth || displayHeight > maxDisplayHeight) {
                                    const scale = Math.min(maxDisplayWidth / displayWidth, maxDisplayHeight / displayHeight);
                                    displayWidth *= scale;
                                    displayHeight *= scale;
                                }
                                
                                fabricImg.set({
                                    left: (this.canvas.width - displayWidth) / 2,
                                    top: (this.canvas.height - displayHeight) / 2,
                                    scaleX: displayWidth / (fabricImg.width || htmlImg.width),
                                    scaleY: displayHeight / (fabricImg.height || htmlImg.height),
                                    id: imgId,
                                    selectable: true,  // КРИТИЧНО: Разрешаем выбор изображения
                                
                                    evented: true,     // КРИТИЧНО: Разрешаем события на изображении
                                    hasControls: true, // КРИТИЧНО: Разрешаем контролы для изменения размера
                                    hasBorders: true   // КРИТИЧНО: Разрешаем границы для перемещения
                                });
                                // КРИТИЧНО: Отправляем изображение ДО добавления на canvas, чтобы избежать автоматического создания Group
                                // Используем небольшую задержку, чтобы убедиться, что URL установлен
                                setTimeout(() => {
                                    // НЕ устанавливаем isDrawing = true, так как изображение уже отправлено
                                    // и мы не хотим блокировать события canvas
                                    
                                    // Убеждаемся, что URL установлен перед отправкой
                                    if (!fabricImg._src && !fabricImg._imageUrl) {
                                        try {
                                            const imgEl = fabricImg.getElement();
                                            if (imgEl && imgEl.src) {
                                                fabricImg._src = imgEl.src;
                                                fabricImg._imageUrl = imgEl.src;
                                            }
                                        } catch (e) {
                                            // Ошибка при получении элемента
                                        }
                                    }
                                    
                                    if (fabricImg._src || fabricImg._imageUrl) {
                                        // КРИТИЧНО: Отправляем изображение СРАЗУ, ДО добавления на canvas
                                        // Отправляем напрямую, создавая объект вручную, чтобы избежать обертки в Group
                                        const imageUrlToSend = fabricImg._src || fabricImg._imageUrl;
                                        
                                        // Создаем объект изображения вручную для отправки
                                        const imageObjectToSend = {
                                            type: 'image',
                                            id: fabricImg.id,
                                            src: imageUrlToSend,
                                            left: fabricImg.left || 0,
                                            top: fabricImg.top || 0,
                                            scaleX: fabricImg.scaleX || 1,
                                            scaleY: fabricImg.scaleY || 1,
                                            angle: fabricImg.angle || 0,
                                            opacity: fabricImg.opacity !== undefined ? fabricImg.opacity : 1,
                                            width: fabricImg.width || htmlImg.width,
                                            height: fabricImg.height || htmlImg.height
                                        };
                                        
                                        // ===== ЛОГИРОВАНИЕ ДЛЯ ДИАГНОСТИКИ =====
                                        console.log('[Whiteboard] Sending image object:', {
                                            id: imageObjectToSend.id,
                                            hasSrc: !!imageObjectToSend.src,
                                            srcLength: imageObjectToSend.src ? imageObjectToSend.src.length : 0,
                                            srcPreview: imageObjectToSend.src ? imageObjectToSend.src.substring(0, 100) : 'none',
                                            type: imageObjectToSend.type
                                        });
                                        
                                        // Отправляем через WebSocket напрямую
                                        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                                            const message = {
                                                type: 'whiteboard-object',
                                                room: this.roomName,
                                                from: this.userId,
                                                data: {
                                                    eventType: 'object-added',
                                                    object: imageObjectToSend
                                                }
                                            };
                                            this.socket.send(JSON.stringify(message));
                                            console.log('[Whiteboard] Image object sent via WebSocket'); // ДОБАВЛЕНО ДЛЯ ДИАГНОСТИКИ
                                        }
                                    }
                                    
                                    // Теперь добавляем на canvas (изображение уже отправлено, не блокируем события)
                                    requestAnimationFrame(() => {
                                        try {
                                            this.canvas.add(fabricImg);
                                            this.canvas.renderAll();
                                            
                                            // КРИТИЧНО: Проверяем, не обернулось ли изображение в Group
                                            const addedObj = this.canvas.getObjects().find(o => o.id === imgId);
                                            if (addedObj) {
                                                if (addedObj.type === 'group') {
                                                    console.warn('[Whiteboard] ⚠️ Image was wrapped in group, extracting...');
                                                    // Пытаемся найти изображение внутри Group
                                                    if (addedObj.getObjects) {
                                                        const imageInGroup = addedObj.getObjects().find(o => {
                                                            const objType = (o.type || '').toLowerCase();
                                                            return objType === 'image';
                                                        });
                                                        if (imageInGroup) {
                                                            // Устанавливаем ID изображения
                                                            imageInGroup.id = imgId;
                                                            // Сохраняем URL
                                                            imageInGroup._src = imageUrl;
                                                            imageInGroup._imageUrl = imageUrl;
                                                            // Используем новый метод для извлечения изображения из группы
                                                            this._extractImageFromGroup(addedObj, imageInGroup, objData);
                                                        }
                                                    }
                                                } else if (addedObj.type === 'image') {
                                                    // Изображение добавлено успешно без Group wrapper
                                                    console.log('[Whiteboard] ✅ Image added successfully without Group wrapper');
                                                }
                                            }
                                            
                                            // КРИТИЧНО: Убеждаемся, что canvas остается интерактивным
                                            this.canvas.selection = true;
                                            this.canvas.interactive = true;
                                        } catch (addError) {
                                            // Ошибка при добавлении изображения на canvas
                                        }
                                    });
                                }, 50);
                                
                                // Скрываем индикатор загрузки
                                this.hideImageLoadingIndicator();
                                
                                resolve(fabricImg);
                    } catch (error) {
                        this.hideImageLoadingIndicator();
                        reject(error);
                    }
                };
                
                htmlImg.onerror = (error) => {
                    this.hideImageLoadingIndicator();
                    reject(new Error('Failed to load server image'));
                };
                
                htmlImg.src = imageUrl;
            });
        } catch (error) {
            this.hideImageLoadingIndicator();
            return Promise.reject(error);
        }
    }
    
    // Очистка доски
    clear() {
        if (confirm('Очистить всю доску?')) {
            this.canvas.clear();
            this.canvas.backgroundColor = '#ffffff';
            this.canvas.renderAll();
            
            // Отправляем событие очистки
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                this.socket.send(JSON.stringify({
                    type: 'whiteboard-clear',
                    room: this.roomName,
                    from: this.userId
                }));
            }
        }
    }
    
    // Обработка удаленной очистки
    handleRemoteClear(data) {
        if (data.from === this.userId) return;
        this.canvas.clear();
        this.canvas.backgroundColor = '#ffffff';
        this.canvas.renderAll();
    }
    
    // Показать/скрыть доску
    show() {
        if (this.canvas) {
            this.canvas.getElement().parentElement.style.display = 'block';
            this.isActive = true;
            
            // КРИТИЧНО: Принудительно рендерим canvas сразу
            this.canvas.renderAll();
            
            console.log('[Whiteboard] 👁️ Whiteboard shown, loading pending images:', this.pendingImages.length);

            // НЕМЕДЛЕННАЯ загрузка изображений из очереди
            if (this.pendingImages.length > 0) {
                console.log('[Whiteboard] ⚡ Immediately loading pending images on show');
                this._loadNextImage();
            } else {
                // Если нет изображений в очереди, все равно принудительно рендерим
                setTimeout(() => {
                    this.canvas.renderAll();
                    console.log('[Whiteboard] ✅ Canvas rendered after show');
                }, 100);
            }
        }
    }
    
    hide() {
        if (this.canvas) {
            this.canvas.getElement().parentElement.style.display = 'none';
            this.isActive = false;
        }
    }
    
    // Принудительная синхронизация состояния доски (изображения и пути) при подключении
    forceImageSynchronization() {
        console.log('[Whiteboard] 🔄 Forcing full whiteboard synchronization');
        
        if (!this.canvas) return;
        
        // Проверяем все объекты на canvas
        const allObjects = this.canvas.getObjects();
        const images = allObjects.filter(obj => 
            obj.type === 'image' || obj._src || obj._imageUrl
        );
        const paths = allObjects.filter(obj => 
            obj.type === 'path' || obj instanceof fabric.Path
        );
        
        console.log('[Whiteboard] 📊 Current state on canvas:', {
            totalObjects: allObjects.length,
            images: images.length,
            paths: paths.length
        });
        
        // Принудительно обновляем каждое изображение
        images.forEach((img, index) => {
            console.log(`[Whiteboard] 🔍 Image ${index + 1}:`, {
                id: img.id,
                hasSrc: !!(img._src || img._imageUrl),
                position: { left: img.left, top: img.top }
            });
        });
        
        // Проверяем пути
        paths.forEach((path, index) => {
            console.log(`[Whiteboard] 📝 Path ${index + 1}:`, {
                id: path.id,
                stroke: path.stroke,
                strokeWidth: path.strokeWidth
            });
        });
        
        // Принудительно рендерим все объекты (изображения и пути)
        this.canvas.renderAll();
        
        // Если есть изображения в очереди, загружаем их немедленно
        if (this.pendingImages.length > 0) {
            console.log('[Whiteboard] ⚡ Loading queued images on synchronization');
            this._loadNextImage();
        } else {
            // Даже если нет изображений в очереди, принудительно рендерим через небольшую задержку
            setTimeout(() => {
                this.canvas.renderAll();
                console.log('[Whiteboard] ✅ Canvas fully rendered after synchronization');
            }, 200);
        }
    }
    
    // Установить цвет кисти
    setBrushColor(color) {
        this.brushColor = color;
        if (this.canvas && this.canvas.freeDrawingBrush) {
            this.canvas.freeDrawingBrush.color = color;
        }
    }
    
    // Установить ширину кисти
    setBrushWidth(width) {
        this.brushWidth = width;
        if (this.canvas && this.canvas.freeDrawingBrush) {
            this.canvas.freeDrawingBrush.width = width;
        }
    }
    
    // Обновляем кисть при изменении размера canvas
    updateBrush() {
        if (this.canvas && this.canvas.freeDrawingBrush) {
            this.canvas.freeDrawingBrush.width = this.brushWidth;
            this.canvas.freeDrawingBrush.color = this.brushColor;
        }
    }
    
    // Уничтожить canvas
    dispose() {
        if (this.canvas) {
            this.canvas.dispose();
            this.canvas = null;
        }
        this.cursors = {};
        this.pendingImages = [];
        this.isLoadingImages = false;
    }
    
    // Загрузить изображение на canvas
    _loadImageToCanvas(objData, callback) {
        if (!this.canvas) {
            console.warn('[Whiteboard] ⚠️ Canvas not available for image load');
            if (callback) callback(false);
            return;
        }
        
        // КРИТИЧНО: Даже если доска не активна, ВСЕГДА пытаемся загрузить изображение
        // для системных сообщений и восстановления состояния
        const shouldLoad = this.isActive || objData._isSystem || objData.from === 'system';
        
        if (!shouldLoad) {
            console.log('[Whiteboard] ⏳ Whiteboard not active, queuing image:', objData.id);
            this.pendingImages.push(objData);
            if (callback) callback(true); // Возвращаем true, так как изображение добавлено в очередь
            return;
        }

        console.log('[Whiteboard] 🖼️ Loading image START:', {
            id: objData.id,
            hasSrc: !!objData.src,
            isActive: this.isActive
        });
        
        // КРИТИЧНО: Проверяем наличие src перед загрузкой
        if (!objData.src) {
            // Пытаемся найти src в других полях
            objData.src = objData._src || objData._imageUrl || objData.src;
            if (!objData.src) {
                // Если src все еще отсутствует, не загружаем изображение
                console.error('[Whiteboard] ❌ Image has no src!');
                if (callback) callback(false);
                return;
            }
        }
        
        // КРИТИЧНО: Преобразуем относительный путь в полный URL
        // Сервер может отправлять относительный путь типа /media/whiteboard/TEST2/..., 
        // но браузеру нужен полный URL для загрузки изображения
        if (objData.src && objData.src.startsWith('/') && !objData.src.startsWith('//')) {
            objData.src = window.location.origin + objData.src;
        }
        
        // КРИТИЧНО: НЕ устанавливаем isDrawing = true, чтобы не блокировать события рисования
        // Флаг уже сброшен перед вызовом этой функции
        const wasDrawing = this.isDrawing;
        
        // Определяем, это URL или base64
        const isUrl = objData.src && (objData.src.startsWith('http://') || objData.src.startsWith('https://') || objData.src.startsWith('/'));
        console.log('[Whiteboard] 📍 Image type:', isUrl ? 'URL' : 'base64');
        
        // УЛУЧШЕННАЯ обработка ошибок с повторными попытками
        let retryCount = 0;
        const maxRetries = 2;
        
        const attemptLoad = () => {
            // Создаем HTMLImageElement из src (может быть URL или base64)
        const htmlImg = new Image();
        htmlImg.crossOrigin = 'anonymous';
        
        let imageLoaded = false;
            let loadTimer = null;
        
        htmlImg.onload = () => {
                if (imageLoaded) return;
            imageLoaded = true;
            
                if (loadTimer) clearTimeout(loadTimer);
            
                console.log('[Whiteboard] ✅ Image loaded successfully, dimensions:', htmlImg.width, 'x', htmlImg.height);

            requestAnimationFrame(() => {
                try {
                    const fabricImg = new fabric.Image(htmlImg);
                    const imgId = objData.id || `system-${Date.now()}-${Math.random()}`;
                    
                        console.log('[Whiteboard] 🎨 Creating fabric image with ID:', imgId);
                    
                        // Пропускаем если изображение уже существует
                    const existingObj = this.canvas.getObjects().find(o => o.id === imgId);
                    if (existingObj) {
                            console.log('[Whiteboard] ⚠️ Image already exists, updating properties');
                            // ОБНОВЛЯЕМ свойства существующего изображения
                            existingObj.set({
                                left: objData.left || 0,
                                top: objData.top || 0,
                                scaleX: objData.scaleX || 1,
                                scaleY: objData.scaleY || 1,
                                angle: objData.angle || 0,
                                opacity: objData.opacity !== undefined ? objData.opacity : 1
                            });
                            existingObj.setCoords();
                            this.canvas.renderAll();
                            
                        if (callback) callback(true);
                        return;
                    }
                    
                    // Копируем все свойства из objData
                    const imageProps = {
                        left: objData.left || 0,
                        top: objData.top || 0,
                        scaleX: objData.scaleX || 1,
                        scaleY: objData.scaleY || 1,
                        angle: objData.angle || 0,
                        opacity: objData.opacity !== undefined ? objData.opacity : 1,
                        id: imgId,
                        selectable: true,  // КРИТИЧНО: Разрешаем выбор изображения для всех пользователей
                        evented: true,     // КРИТИЧНО: Разрешаем события на изображении
                        hasControls: true, // КРИТИЧНО: Разрешаем контролы для изменения размера
                        hasBorders: true   // КРИТИЧНО: Разрешаем границы для перемещения
                    };
                    
                    console.log('[Whiteboard] 🔧 Setting image properties:', imageProps);
                    
                    fabricImg.set(imageProps);
                    
                    // Сохраняем src (URL или base64) для возможной повторной синхронизации
                    if (objData.src) {
                        fabricImg._src = objData.src;
                        fabricImg._imageUrl = isUrl ? objData.src : null; // Сохраняем URL отдельно если это URL
                    }
                    
                    // Добавляем на canvas
                    this.canvas.add(fabricImg);
                    console.log('[Whiteboard] ➕ Image added to canvas');
                    
                    // КРИТИЧНО: Явно устанавливаем интерактивные свойства ПОСЛЕ добавления на canvas
                    // Это гарантирует, что изображение будет интерактивным для всех пользователей
                    fabricImg.set({
                        selectable: true,
                        evented: true,
                        hasControls: true,
                        hasBorders: true,
                        lockMovementX: false,
                        lockMovementY: false,
                        lockRotation: false,
                        lockScalingX: false,
                        lockScalingY: false
                    });
                    
                    // КРИТИЧНО: Убеждаемся, что canvas остается интерактивным
                    this.canvas.selection = true;
                    this.canvas.interactive = true;
                    
                    // КРИТИЧНО: НЕ устанавливаем активный объект, чтобы другие пользователи могли выбирать изображение
                    // this.canvas.setActiveObject(fabricImg); // Убрано, чтобы не мешать другим пользователям
                    this.canvas.renderAll();
                    console.log('[Whiteboard] 🎬 Canvas rendered with interactive image');
                    
                    // Проверка, что изображение действительно на canvas
                    const objectsCount = this.canvas.getObjects().length;
                    console.log('[Whiteboard] 📊 Total objects on canvas:', objectsCount);
                    
                    // КРИТИЧНО: Проверяем, что изображение имеет правильные свойства
                    const addedImg = this.canvas.getObjects().find(o => o.id === imgId);
                    if (addedImg) {
                        console.log('[Whiteboard] ✅ Image properties after add:', {
                            selectable: addedImg.selectable,
                            evented: addedImg.evented,
                            hasControls: addedImg.hasControls,
                            hasBorders: addedImg.hasBorders
                        });
                    }
                    
                    // КРИТИЧНО: Убеждаемся, что флаг isDrawing сброшен
                    this.isDrawing = wasDrawing;
                    
                    console.log('[Whiteboard] ✅ Image loading COMPLETE');
                    if (callback) callback(true);
                } catch (error) {
                    console.error('[Whiteboard] ❌ Error creating fabric image:', error, error.stack);
                    this.isDrawing = wasDrawing;
                    if (callback) callback(false);
                }
            });
        };
        
        htmlImg.onerror = (error) => {
                if (imageLoaded) return;
            imageLoaded = true;
                
                if (loadTimer) clearTimeout(loadTimer);
                
                console.error('[Whiteboard] ❌ Image load error:', {
                    error: error,
                    src: objData.src,
                    retryCount: retryCount
                });

                // ПОВТОРНАЯ ПОПЫТКА при ошибке
                if (retryCount < maxRetries) {
                    retryCount++;
                    console.log(`[Whiteboard] 🔄 Retrying image load (attempt ${retryCount}/${maxRetries})`);
                    setTimeout(attemptLoad, 1000 * retryCount); // Экспоненциальная задержка
                } else {
                    console.error('[Whiteboard] ❌ All image load attempts failed');
            this.isDrawing = wasDrawing;
            if (callback) callback(false);
                }
            };

            // Таймаут на случай зависания загрузки
            loadTimer = setTimeout(() => {
            if (!imageLoaded) {
                imageLoaded = true;
                    console.error('[Whiteboard] ⏱️ Image load timeout');
                    htmlImg.onerror(new Error('Load timeout'));
                }
            }, 15000); // 15 секунд таймаут

            console.log('[Whiteboard] 🚀 Starting image load from:', objData.src);
            htmlImg.src = objData.src;
        };

        // Начинаем первую попытку загрузки
        attemptLoad();
    }
    
    // Загрузить следующее изображение из очереди (по одному)
    _loadNextImage() {
        if (this.isLoadingImages || !this.canvas) {
            return;
        }
        
        if (this.pendingImages.length === 0) {
            this.isDrawing = false;
            if (this.canvas) {
                this.canvas.selection = true;
                this.canvas.interactive = true;
            }
            
            // КРИТИЧНО: После загрузки всех изображений из очереди, принудительно рендерим
            setTimeout(() => {
                this.canvas.renderAll();
                console.log('[Whiteboard] ✅ All pending images processed, canvas rendered');
            }, 100);
            return;
        }
        
        this.isLoadingImages = true;
        const objData = this.pendingImages.shift();
        const remaining = this.pendingImages.length;
        
        console.log('[Whiteboard] 🎯 Loading image from queue:', {
            id: objData.id,
            remaining: remaining,
            hasSrc: !!objData.src
        });

        // ПРИНУДИТЕЛЬНАЯ загрузка, даже если есть ошибки
        this._loadImageToCanvas(objData, (success) => {
            this.isLoadingImages = false;
            
            if (success) {
                console.log('[Whiteboard] ✅ Queue image loaded successfully, remaining:', remaining);
            } else {
                console.warn('[Whiteboard] ⚠️ Queue image failed, but continuing:', remaining);
                // ДАЖЕ ПРИ ОШИБКЕ продолжаем загрузку следующих изображений
            }
            
            // Уменьшенная задержка для быстрой загрузки всех изображений
            setTimeout(() => {
                this._loadNextImage();
            }, 50); // Уменьшено с 200ms до 50ms для скорости
        });
    }
}


