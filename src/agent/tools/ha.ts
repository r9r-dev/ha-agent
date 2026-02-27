import type Anthropic from '@anthropic-ai/sdk';
import type { HAClient } from '../../ha/client';
import type { HADatabase } from '../../db';

export interface ToolContext {
  ha: HAClient;
  db: HADatabase;
  chatId: number;
}

export const haTools: Anthropic.Tool[] = [
  {
    name: 'get_entity_state',
    description:
      "Récupère l'état actuel d'une entité Home Assistant (lumière, capteur, thermostat, etc.)",
    input_schema: {
      type: 'object' as const,
      properties: {
        entity_id: {
          type: 'string',
          description:
            "Identifiant de l'entité (ex: light.salon, sensor.temperature_chambre, climate.chauffage)",
        },
      },
      required: ['entity_id'],
    },
  },
  {
    name: 'list_entities',
    description:
      'Liste les entités Home Assistant disponibles. Filtrable par domaine (light, switch, sensor, climate, media_player, cover, automation, scene...) et/ou par terme de recherche.',
    input_schema: {
      type: 'object' as const,
      properties: {
        domain: {
          type: 'string',
          description:
            'Domaine à filtrer (light, switch, sensor, climate, media_player, cover, etc.). Optionnel.',
        },
        search: {
          type: 'string',
          description:
            "Terme de recherche pour filtrer par nom d'entité ou friendly_name. Optionnel.",
        },
      },
      required: [],
    },
  },
  {
    name: 'call_ha_service',
    description:
      "Appelle un service Home Assistant pour contrôler un appareil. Exemples de services: light/turn_on, light/turn_off, switch/toggle, climate/set_temperature, media_player/play_media, cover/open_cover, automation/trigger, scene/turn_on.",
    input_schema: {
      type: 'object' as const,
      properties: {
        domain: {
          type: 'string',
          description: 'Domaine du service (light, switch, climate, media_player, cover, etc.)',
        },
        service: {
          type: 'string',
          description:
            'Service à appeler (turn_on, turn_off, toggle, set_temperature, open_cover, etc.)',
        },
        data: {
          type: 'object',
          description:
            "Données du service: inclure entity_id et les paramètres additionnels (brightness 0-255, color_temp, temperature, volume_level, etc.). entity_id peut être une string ou un tableau.",
        },
      },
      required: ['domain', 'service', 'data'],
    },
  },
  {
    name: 'manage_alert',
    description:
      "Ajoute ou supprime une alerte proactive pour l'utilisateur. Quand une alerte est active, l'utilisateur reçoit un message automatique dès que l'état de l'entité change.",
    input_schema: {
      type: 'object' as const,
      properties: {
        entity_id: {
          type: 'string',
          description: "Identifiant de l'entité à surveiller",
        },
        action: {
          type: 'string',
          enum: ['add', 'remove'],
          description: "'add' pour activer l'alerte, 'remove' pour la désactiver",
        },
      },
      required: ['entity_id', 'action'],
    },
  },
  {
    name: 'list_alerts',
    description: "Liste toutes les alertes actives configurées pour l'utilisateur.",
    input_schema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  },
  {
    name: 'set_preference',
    description:
      "Mémorise une préférence ou information personnelle pour l'utilisateur (alias d'entités, nom d'une pièce, préférences de confort, etc.). Ces informations sont injectées dans le contexte à chaque conversation.",
    input_schema: {
      type: 'object' as const,
      properties: {
        key: {
          type: 'string',
          description: "Clé de la préférence (ex: 'alias_salon', 'temperature_preferee', 'nom')",
        },
        value: {
          type: 'string',
          description: 'Valeur à mémoriser',
        },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'get_entity_history',
    description:
      "Récupère l'historique des états d'une entité sur les dernières N heures. Utile pour voir les tendances de température, les activités récentes, etc.",
    input_schema: {
      type: 'object' as const,
      properties: {
        entity_id: {
          type: 'string',
          description: "Identifiant de l'entité",
        },
        hours: {
          type: 'number',
          description: "Nombre d'heures d'historique (défaut: 24, max: 168)",
        },
      },
      required: ['entity_id'],
    },
  },
];

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext
): Promise<string> {
  const { ha, db, chatId } = ctx;
  try {
    switch (name) {
      case 'get_entity_state': {
        const state = await ha.getState(input.entity_id as string);
        const friendly = (state.attributes.friendly_name as string) ?? state.entity_id;
        return JSON.stringify(
          {
            entity_id: state.entity_id,
            friendly_name: friendly,
            state: state.state,
            attributes: state.attributes,
            last_updated: state.last_updated,
          },
          null,
          2
        );
      }

      case 'list_entities': {
        let states = input.domain
          ? await ha.getStatesByDomain(input.domain as string)
          : await ha.getStates();

        if (input.search) {
          const q = (input.search as string).toLowerCase();
          states = states.filter(
            (s) =>
              s.entity_id.toLowerCase().includes(q) ||
              ((s.attributes.friendly_name as string) ?? '').toLowerCase().includes(q)
          );
        }

        // Limit to avoid token overflow
        const items = states.slice(0, 60).map((s) => ({
          entity_id: s.entity_id,
          friendly_name: (s.attributes.friendly_name as string) ?? s.entity_id,
          state: s.state,
        }));

        return JSON.stringify(items, null, 2);
      }

      case 'call_ha_service': {
        await ha.callService(
          input.domain as string,
          input.service as string,
          input.data as Record<string, unknown>
        );
        return `Service ${input.domain}.${input.service} exécuté avec succès.`;
      }

      case 'get_entity_history': {
        const hours = Math.min((input.hours as number) ?? 24, 168);
        const history = await ha.getHistory(input.entity_id as string, hours);
        // Flatten and return last 50 state changes
        const entries = history.flat().slice(-50);
        return JSON.stringify(entries, null, 2);
      }

      case 'manage_alert': {
        const entityId = input.entity_id as string;
        const action = input.action as 'add' | 'remove';
        db.setAlert(chatId, entityId, action === 'add');
        return action === 'add'
          ? `Alerte activée pour ${entityId}.`
          : `Alerte désactivée pour ${entityId}.`;
      }

      case 'list_alerts': {
        const alerts = db.getAlerts(chatId);
        if (alerts.length === 0) return 'Aucune alerte active.';
        return alerts.join('\n');
      }

      case 'set_preference': {
        db.setPreference(chatId, input.key as string, input.value as string);
        return `Préférence mémorisée: ${input.key} = ${input.value}`;
      }

      default:
        return `Outil inconnu: ${name}`;
    }
  } catch (error) {
    return `Erreur: ${error instanceof Error ? error.message : String(error)}`;
  }
}
