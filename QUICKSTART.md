# Быстрый старт

## Установка и запуск

### Шаг 1: Установка зависимостей

```bash
npm install
```

Это установит:
- `@types/vscode` - типы для VS Code API
- `@types/node` - типы для Node.js
- `typescript` - компилятор TypeScript

### Шаг 2: Компиляция проекта

```bash
npm run compile
```

Или для автоматической перекомпиляции при изменениях:

```bash
npm run watch
```

### Шаг 3: Запуск расширения

1. Откройте проект в VS Code или Cursor
2. Нажмите `F5` или выберите `Run > Start Debugging`
3. Откроется новое окно "Extension Development Host"
4. В новом окне нажмите `Ctrl+Shift+P` (или `Cmd+Shift+P` на Mac)
5. Введите и выберите команду: `AI Coder: Open AI Coder Panel`

### Шаг 4: Использование

1. В открывшейся панели введите ваш запрос в текстовое поле
2. Нажмите кнопку "Сгенерировать код"
3. Результат появится в секции результата

## Структура после компиляции

После компиляции будет создана папка `out/` с скомпилированными JavaScript файлами:

```
out/
├── extension.js
├── webview/
│   └── panel.js
└── services/
    └── llmService.js
```

## Отладка

### Отладка Extension Host

1. Установите breakpoints в TypeScript файлах
2. Запустите через `F5`
3. VS Code автоматически подключится к процессу расширения

### Отладка Webview

1. Откройте Developer Tools в Webview:
   - В панели Webview нажмите правой кнопкой мыши
   - Выберите "Inspect Element" или используйте команду в Command Palette
2. Используйте `console.log()` в `media/main.js` для отладки

## Решение проблем

### Ошибки компиляции

Если видите ошибки типа "Cannot find module 'vscode'":
1. Убедитесь, что выполнили `npm install`
2. Проверьте, что `@types/vscode` установлен: `npm list @types/vscode`

### Панель не открывается

1. Проверьте консоль Output в VS Code (View > Output)
2. Выберите "Log (Extension Host)" в выпадающем списке
3. Ищите ошибки при активации расширения

### Изменения не применяются

1. Убедитесь, что запущен `npm run watch`
2. Перезапустите Extension Development Host (закройте и снова нажмите F5)
3. Обновите Webview (закройте и откройте панель заново)

## Следующие шаги

После успешного запуска базовой версии:

1. Изучите `ARCHITECTURE.md` для понимания структуры
2. Начните интеграцию с LLM провайдером в `src/services/llmService.ts`
3. Расширьте UI в `media/main.js` и `media/main.css`
4. Добавьте новые команды в `package.json`

## Полезные команды

```bash
# Компиляция
npm run compile

# Автоматическая перекомпиляция
npm run watch

# Подготовка к публикации
npm run vscode:prepublish

# Проверка package.json
npm run --silent
```

