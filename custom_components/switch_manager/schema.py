import voluptuous as vol
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.script import SCRIPT_MODE_CHOICES, DEFAULT_SCRIPT_MODE

CONDITION_SCHEMA = vol.Schema({
    vol.Required('key'): cv.string,
    vol.Required('value'): cv.string,
})
BLUEPRINT_ACTION_SCHEMA = vol.Schema({
    vol.Required('title'): cv.string,
    vol.Optional('conditions', default=[]): vol.Any(cv.string, [CONDITION_SCHEMA])
})
SHAPE_CIRCLE_SCHEMA = vol.Schema({
    vol.Required('x'): cv.positive_int,
    vol.Required('y'): cv.positive_int,
    vol.Required('width'): cv.positive_int  
})
SHAPE_RECT_SCHEMA = SHAPE_CIRCLE_SCHEMA.extend({
    vol.Required('height'): cv.positive_int
})
SHAPE_PATH_SCHEMA = vol.Schema({
    vol.Required('d'): cv.string
})

BLUEPRINT_BUTTON_SCHEMA = vol.Schema({
    vol.Required('actions'): vol.All(cv.ensure_list, [BLUEPRINT_ACTION_SCHEMA]),
    vol.Optional('conditions', default=[]): vol.Any(cv.string, [CONDITION_SCHEMA]),

    vol.Optional('x'): cv.positive_int,
    vol.Optional('y'): cv.positive_int,
    vol.Optional('width'): cv.positive_int,
    vol.Optional('height'): cv.positive_int,
    vol.Optional('d'): cv.string,
})
BLUEPRINT_SCHEMA = vol.Schema({
    vol.Required('name'): cv.string,
    vol.Required('service'): cv.string,
    vol.Required('event_type'): cv.string,
    vol.Required('buttons'): vol.All(cv.ensure_list, [BLUEPRINT_BUTTON_SCHEMA]),
    vol.Optional('conditions', default=[]): vol.Any(cv.string, [CONDITION_SCHEMA]),
    vol.Optional('info'): cv.string,
    vol.Optional('variant'): cv.string,
    # Groups multiple `name` entries (device hardware variants, e.g. an
    # original vs. an "E1" revision) under one top-level card in the
    # picker. Falls back to `name` when not set, so existing blueprints
    # are unaffected.
    vol.Optional('device_group'): cv.string,
    # Display-only grouping for the "device variant" cascade step. Lets
    # several DISTINCT `name` entries (kept separate on purpose, e.g. in
    # case a firmware difference later requires splitting them again)
    # appear as one selectable point in the UI, without merging their
    # actual identity.
    vol.Optional('device_variant'): cv.string,
    # Cosmetic-only manufacturer label shown as a small badge, used to
    # keep whitelabeled/rebranded hardware (e.g. the same TS0044 chipset
    # sold as TuYa/Moes/Zignito) findable by the name printed on the box,
    # even when several such blueprints are collapsed into one `name`.
    vol.Optional('brand'): cv.string
})
BLUEPRINT_EVENT_SCHEMA = BLUEPRINT_SCHEMA.extend({
    vol.Required('identifier_key'): cv.string
})
BLUEPRINT_MQTT_SCHEMA = BLUEPRINT_SCHEMA.extend({
    vol.Optional('mqtt_topic_format'): cv.string,
    vol.Optional('mqtt_sub_topics', default=False): cv.boolean
})
def _normalize_config_action(value):
    """Normalize raw HA action dicts into {mode, sequence} wrapper."""
    if isinstance(value, dict) and 'sequence' not in value and ('action' in value or 'service' in value):
        return {'mode': DEFAULT_SCRIPT_MODE, 'sequence': [value]}
    return value

SWITCH_MANAGER_CONFIG_ACTION_SCHEMA = vol.All(
    _normalize_config_action,
    vol.Schema({
        vol.Required('mode', default=DEFAULT_SCRIPT_MODE): vol.In(SCRIPT_MODE_CHOICES),
        vol.Required('sequence', default=[]): cv.ensure_list # cv.SCRIPT_SCHEMA: This was causing problems and not parsing json format when action delay etc was used
    })
)
SWITCH_MANAGER_CONFIG_BUTTON_SCHEMA = vol.Schema({
    vol.Required('actions'): vol.All(cv.ensure_list, [SWITCH_MANAGER_CONFIG_ACTION_SCHEMA])
})
SWITCH_MANAGER_CONFIG_SCHEMA = vol.Schema({
    vol.Required('id', default=None): vol.Any(str, int, None),
    vol.Required('name'): cv.string,
    vol.Required('enabled', default=True): bool,
    vol.Required('blueprint'): cv.string,
    vol.Required('identifier'): cv.string,
    vol.Optional('variables'): vol.Any(None, dict),
    vol.Required('buttons'): vol.All(cv.ensure_list, [SWITCH_MANAGER_CONFIG_BUTTON_SCHEMA])
}, extra=vol.ALLOW_EXTRA)

SERVICE_SET_VARIABLES_SCHEMA = vol.Schema({
    vol.Required('switch_id'): vol.Any(str, int),
    vol.Required('variables'): dict,
})