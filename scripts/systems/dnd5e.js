import { Stealthy } from '../stealthy.js';
import Engine from '../engine.js';
import Doors from "../doors.js";

class Engine5e extends Engine {

  constructor() {
    super();

    game.keybindings.register(Stealthy.MODULE_ID, "endTurn", {
      name: game.i18n.localize("stealthy.dnd5e.endTurn.name"),
      hint: game.i18n.localize("stealthy.dnd5e.endTurn.hint"),
      editable: [
        { key: "End" }
      ],
      onDown: () => {
        const combat = game.combat;
        if (!combat?.active) return;
        const combatant = combat.combatants.get(combat.current.combatantId);
        if (!combatant?.isOwner) return;
        return combat.nextTurn();
      }
    });

    Hooks.once('setup', () => {
      game.settings.register(Stealthy.MODULE_ID, 'perceptionDisadvantage', {
        name: game.i18n.localize("stealthy.dnd5e.perceptionDisadvantage.name"),
        hint: game.i18n.localize("stealthy.dnd5e.perceptionDisadvantage.hint"),
        scope: 'world',
        config: true,
        type: Boolean,
        default: true,
      });

      game.settings.register(Stealthy.MODULE_ID, 'stealthKey', {
        name: game.i18n.localize("stealthy.dnd5e.stealthKey.name"),
        hint: game.i18n.localize("stealthy.dnd5e.stealthKey.hint"),
        scope: 'world',
        config: true,
        type: String,
        default: 'ste'
      });

      game.settings.register(Stealthy.MODULE_ID, 'perceptionKey', {
        name: game.i18n.localize("stealthy.dnd5e.perceptionKey.name"),
        hint: game.i18n.localize("stealthy.dnd5e.perceptionKey.hint"),
        scope: 'world',
        config: true,
        type: String,
        default: 'prc'
      });

      game.settings.register(Stealthy.MODULE_ID, 'ignorePassiveFloor', {
        name: game.i18n.localize("stealthy.dnd5e.ignorePassiveFloor.name"),
        hint: game.i18n.localize("stealthy.dnd5e.ignorePassiveFloor.hint"),
        scope: 'world',
        config: true,
        type: Boolean,
        default: false,
      });

      game.settings.register(Stealthy.MODULE_ID, 'friendlyUmbralSight', {
        name: game.i18n.localize("stealthy.dnd5e.friendlyUmbralSight.name"),
        scope: 'world',
        config: false,
        type: String,
        choices: {
          'allow': game.i18n.localize("stealthy.dnd5e.friendlyUmbralSight.allow"),
          'inCombat': game.i18n.localize("stealthy.dnd5e.friendlyUmbralSight.inCombat"),
          'ignore': game.i18n.localize("stealthy.dnd5e.friendlyUmbralSight.ignore")
        },
        default: 'inCombat'
      });
    });

    Hooks.on('dnd5e.rollSkill', async (actor, roll, skill) => {
      if (skill === game.settings.get(Stealthy.MODULE_ID, 'stealthKey')) {
        await this.rollStealth(actor, roll);
      }
      else if (skill === game.settings.get(Stealthy.MODULE_ID, 'perceptionKey')) {
        await this.rollPerception(actor, roll);
      }
    });

    Hooks.on('renderSettingsConfig', (app, html, data) => {
      $('<div>').addClass('form-group group-header')
        .html(game.i18n.localize("stealthy.dnd5e.name"))
        .insertBefore($('[name="stealthy.perceptionDisadvantage"]')
          .parents('div.form-group:first'));
    });
  }

  patchFoundry() {
    super.patchFoundry();

    // If vision-5e isn't active, just keep the default behavior
    if (!game.modules.get("vision-5e")?.active) return;

    // Pick the sight modes in vision-5e that we want Stealthy to affect
    Hooks.once('setup', () => {
      const sightModes = [
        'basicSight',
        'devilsSight',
        'etherealSight',
        'hearing',
        'lightPerception',
        'seeAll',
        'seeInvisibility',
        'witchSight',
      ];
      for (const mode of sightModes) {
        Stealthy.log(`patching ${mode}`);
        libWrapper.register(
          Stealthy.MODULE_ID,
          `CONFIG.Canvas.detectionModes.${mode}._canDetect`,
          function (wrapped, visionSource, target) {
            do {
              const engine = stealthy.engine;
              if (target instanceof DoorControl) {
                if (!engine.canSpotDoor(target, visionSource)) return false;
                break;
              }
              const tgtToken = target?.document;
              if (tgtToken instanceof TokenDocument) {
                if (engine.isHidden(visionSource, tgtToken, mode)) return false;
              }
            } while (false);
            return wrapped(visionSource, target);
          },
          libWrapper.MIXED,
          { perf_mode: libWrapper.PERF_FAST }
        );
      }
    });
  }

  static LIGHT_LABELS = ['dark', 'dim', 'bright', 'bright'];
  static EXPOSURE = { dark: 0, dim: 1, bright: 2 };

  canDetectHidden(visionSource, tgtToken, detectionMode) {
    const stealthFlag = this.getStealthFlag(tgtToken);
    if (!stealthFlag) return true;

    const srcToken = visionSource.object.document;
    const source = srcToken?.actor;
    const perceptionFlag = this.getPerceptionFlag(srcToken);

    // active perception loses ties, passive perception wins ties to simulate the
    // idea that active skills need to win outright to change the status quo. Passive
    // perception means that stealth is being the active skill.
    const valuePair = perceptionFlag?.perception;
    let perceptionValue;
    if (game.settings.get(Stealthy.MODULE_ID, 'perceptionDisadvantage')) {
      perceptionValue = this.adjustForLightingConditions(valuePair, visionSource, source, tgtToken, detectionMode);
    }
    else {
      perceptionValue = this.adjustForDefaultConditions(valuePair, visionSource, source, tgtToken, detectionMode);
    }

    const stealthValue = this.getStealthValue(stealthFlag);
    Stealthy.logIfDebug(`${detectionMode} vs '${tgtToken.name}': ${perceptionValue} vs ${stealthValue}`, { stealthFlag, perceptionFlag });
    return perceptionValue > stealthValue;
  }

  makeSpotEffectMaker(name) {
    return (flag, source) => {
      let effect = super.makeSpotEffectMaker(name)(flag, source);
      if (game.combat) effect.duration = { turns: 1, seconds: 6 };
      return effect;
    };
  }

  getStealthFlag(token) {
    let flag = super.getStealthFlag(token);
    if (flag && flag.stealth === undefined)
      flag.stealth = flag.token.actor.system.skills[game.settings.get(Stealthy.MODULE_ID, 'stealthKey')].passive;
    return flag;
  }

  getPerceptionFlag(token) {
    const flag = super.getPerceptionFlag(token);
    if (flag) return flag;
    const passive = token.actor.system.skills[game.settings.get(Stealthy.MODULE_ID, 'perceptionKey')].passive;
    return {
      token,
      passive: true,
      perception: {
        normal: passive,
        disadvantaged: passive - 5
      }
    };
  }

  getPerceptionValue(flag) {
    return flag?.perception?.normal ?? flag?.perception;
  }

  async setPerceptionValue(flag, value) {
    if (value === undefined)
      await super.setPerceptionValue(flag, value);
    else {
      const pair = { normal: value, disadvantaged: value - 5 };
      await super.setPerceptionValue(flag, pair);
    }
  }

  async bankPerception(token, value) {
    if (value?.normal === undefined) {
      value = { normal: value, disadvantaged: value - 5 };
    }
    if (stealthy.perceptionToActor) {
      await this.updateOrCreateSpotEffect(token.actor, { perception: value });
    } else {
      await this.bankRollOnToken(token, 'perception', value);
    }
  }

  async rollPerception(actor, roll) {
    Stealthy.log('Stealthy5e.rollPerception', { actor, roll });
    if (!stealthy.bankingPerception) return;

    let perception = { normal: roll.total, disadvantaged: roll.total };
    if (!roll.hasDisadvantage && game.settings.get(Stealthy.MODULE_ID, 'perceptionDisadvantage')) {
      const dice = roll.dice[0];
      if (roll.hasAdvantage) {
        const delta = dice.results[1].result - dice.results[0].result;
        if (delta > 0) {
          perception.disadvantaged -= delta;
        }
      }
      else {
        let disadvantageRoll = await new Roll(`1d20`).evaluate({ async: true });
        const delta = dice.results[0].result - disadvantageRoll.total;
        if (delta > 0) {
          perception.disadvantaged -= delta;
        }
      }
    }

    if (!game.settings.get(Stealthy.MODULE_ID, 'ignorePassiveFloor')) {
      const passivePrc = actor.system.skills[game.settings.get(Stealthy.MODULE_ID, 'perceptionKey')].passive;
      perception.normal = Math.max(perception.normal, passivePrc);
      perception.disadvantaged = Math.max(perception.disadvantaged, passivePrc - 5);
    }

    if (stealthy.perceptionToActor) {
      await this.updateOrCreateSpotEffect(actor, { perception });
    } else {
      await this.bankRollOnToken(actor, 'perception', perception);
    }

    super.rollPerception();
  }

  async rollStealth(actor, roll) {
    Stealthy.log('Stealthy5e.rollStealth', { actor, roll });

    if (stealthy.stealthToActor) {
      await this.updateOrCreateHiddenEffect(actor, { stealth: roll.total });
    } else {
      await this.bankRollOnToken(actor, 'stealth', roll.total);
    }

    super.rollStealth();
  }

  static GetPassivePerceptionWithDisadvantage(source) {
    // todo: don't apply -5 if already disadvantaged
    return source.system.skills[game.settings.get(Stealthy.MODULE_ID, 'stealthKey')].passive - 5;
  }

  adjustForDefaultConditions(perceptionPair, visionSource, source, tgtToken, detectionMode) {
    const passivePrc = source?.system?.skills?.[game.settings.get(Stealthy.MODULE_ID, 'perceptionKey')]?.passive ?? -100;
    let perception = perceptionPair?.normal
      ?? perceptionPair
      ?? (passivePrc + 1);
    return perception;
  }

  // check target Token Lighting conditions via effects usage
  // look for effects that indicate Dim or Dark condition on the token
  adjustForLightingConditions(perceptionPair, visionSource, source, tgtToken, detectionMode) {
    // Extract the normal perception values from the source
    const passivePrc = source?.system?.skills?.[game.settings.get(Stealthy.MODULE_ID, 'perceptionKey')]?.passive ?? -100;
    let active = perceptionPair?.normal ?? perceptionPair;
    let value = active ?? passivePrc;

    // What light band are we told we sit in?
    let lightBand = Engine5e.EXPOSURE[this.getLightExposure(tgtToken)];
    let oldBand = Engine5e.LIGHT_LABELS[lightBand];
    switch (detectionMode) {
      case 'basicSight':
        lightBand += 1;
        break;
      case 'devilsSight':
        if (!lightBand) lightBand = 2;
        break;
      case 'hearing':
        return value;
      case undefined:
        if (visionSource.visionMode?.id === 'darkvision') lightBand += 1;
        break;
    }
    Stealthy.logIfDebug(`${detectionMode} vs '${tgtToken.name}': ${oldBand}-->${Engine5e.LIGHT_LABELS[lightBand]}`);

    // dark = fail, dim = disadvantage, bright = normal
    if (lightBand <= 0) return -100;
    if (lightBand !== 1) return value;
    let passiveDisadv = Engine5e.GetPassivePerceptionWithDisadvantage(source);
    return (active !== undefined) ? (perceptionPair?.disadvantaged ?? value - 5) : passiveDisadv;
  }

}

Hooks.once('init', () => {
  if (game.system.id === 'dnd5e') {
    const systemEngine = new Engine5e();
    if (systemEngine) {
      window[Stealthy.MODULE_ID] = new Stealthy(systemEngine);
    }
  }
});
