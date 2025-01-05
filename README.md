## Библиотека предиктивного анализа пользовательского поведения

Для использования используй команду `npm i predictive_library` после чего импортируй библиотеку в свой проект следующим образом:

```typescript
import { ComponentTracker, InteractionTracker } from 'predict-library';
```

`ComponentTracker` Необходим библиотеке для регистрации компонентов и их дальнейшей предзагрузки
`InteractionTracker` Необходим библиотеке для предсказывания действия пользователя

Пример регистрации компонента:
```typescript
const TrackedPage1 = withTracker(Page1, 'page1', 'page', { title: 'Page 1' }, componentTracker);
```
Для этого был написан специальный трекер, который вы можете импортировать в свой проект:
```typescript
import React, { useEffect } from 'react';
import { ComponentTracker } from 'predict-library';

const withTracker = (WrappedComponent: React.FC, id: string, type: string, metadata: Record<string, any>, tracker: ComponentTracker) => {
  return (props: any) => {
    useEffect(() => {
      tracker.trackComponent(id, type, metadata);
    }, [tracker]);

    return <WrappedComponent {...props} />;
  };
};

export default withTracker;
```
Пример регистрации действий:
```typescript
  const handleButtonClick = (buttonId: string) => {
    interactionTracker.trackInteraction(buttonId, 'click');
  };
```
