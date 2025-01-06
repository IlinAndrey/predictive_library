// src/componentPreload.ts
import predictionModelInstance from './predictionModel';

class ComponentPreload {
    private static instance: ComponentPreload;

    private constructor() {
        this.init();
    }

    public static getInstance(): ComponentPreload {
        if (!ComponentPreload.instance) {
            ComponentPreload.instance = new ComponentPreload();
        }
        return ComponentPreload.instance;
    }

    private init(): void {
        // Автоматически инициируем предзагрузку компонента
        this.preloadPredictedComponent();
    }

    private preloadPredictedComponent(): void {
        const predictedComponent = predictionModelInstance.predictNextAction(Date.now());

        if (predictedComponent) {
            console.log(`Предзагрузка компонента: ${predictedComponent}`);
            // Загружаем компонент в кэш
            this.fetchAndCacheComponent(predictedComponent);
        } else {
            console.log('Нет предсказанного компонента для предзагрузки.');
        }
    }

    private fetchAndCacheComponent(componentId: string): void {
        // Пример реальной загрузки компонента (например, изображения)
        const componentResourceUrl = `/assets/${componentId}.jpg`; // Замените на URL для вашего компонента

        // Кэшируем ресурс с использованием Cache API
        if ('caches' in window) {
            caches.open('predicted-components-cache').then(cache => {
                // Реально загружаем компонент и сохраняем в кэш
                fetch(componentResourceUrl)
                    .then(response => {
                        if (response.ok) {
                            cache.put(componentResourceUrl, response);
                            console.log(`Компонент ${componentId} был предзагружен в кэш.`);
                        } else {
                            console.error(`Ошибка при загрузке компонента ${componentId}: ${response.status}`);
                        }
                    })
                    .catch((error) => {
                        console.error(`Ошибка при предзагрузке компонента ${componentId}:`, error);
                    });
            });
        }
    }

    public preloadComponent(componentId: string): void {
        // Реальная предзагрузка компонента
        console.log(`Предзагрузка компонента: ${componentId}`);

        // Например, можно использовать fetch для предзагрузки данных или кэширование компонента
        const componentUrl = `/components/${componentId}.js`;  // Пример URL для компонента
        fetch(componentUrl)
            .then(response => {
                if (response.ok) {
                    console.log(`Компонент ${componentId} успешно загружен`);
                } else {
                    console.error(`Не удалось загрузить компонент ${componentId}`);
                }
            })
            .catch((error) => {
                console.error('Ошибка при загрузке компонента:', error);
            });
    }
}

export default ComponentPreload;
