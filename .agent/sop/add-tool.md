# Ajouter un outil Claude

Les outils sont définis dans `src/agent/tools/ha.ts`.

## Étapes

### 1. Ajouter la définition dans `haTools`

```typescript
{
  name: 'nom_outil',
  description: 'Description claire de ce que fait l\'outil',
  input_schema: {
    type: 'object' as const,
    properties: {
      param1: {
        type: 'string',
        description: 'Description du paramètre',
      },
    },
    required: ['param1'],
  },
},
```

### 2. Ajouter le case dans `executeTool`

```typescript
case 'nom_outil': {
  const result = await ha.methode(input.param1 as string);
  return JSON.stringify(result, null, 2);
}
```

### 3. Si besoin, ajouter une méthode dans `HAClient`

Voir `src/ha/client.ts`. Les appels REST HA suivent le pattern:
- GET: `this.apiFetch('/endpoint')`
- POST: `this.apiFetch('/endpoint', { method: 'POST', body: JSON.stringify(data) })`

## Exemples d'idées d'outils

- `get_areas` — liste les zones/pièces HA
- `get_automations` — liste les automatisations
- `trigger_automation` — déclenche une automatisation
- `get_calendar_events` — intégration calendrier HA
- `call_conversation` — pipeline de conversation HA
