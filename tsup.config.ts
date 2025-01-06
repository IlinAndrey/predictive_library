import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],        // Главный файл
  splitting: false,               // Разделение файлов (false для библиотек)
  sourcemap: true,                // Карты исходников для отладки
  clean: true,                    // Очистить dist перед сборкой
  dts: true,                      // Генерация .d.ts типов
  format: ['cjs', 'esm'],         // Вывод в двух форматах: CommonJS и ES Module
  minify: true                    // Минификация
});