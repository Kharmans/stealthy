import { Stealthy } from '../stealthy.js';
import Engine from '../engine.js';
import Doors from "../doors.js";

class Engine5e extends Engine {

  constructor() {
    super();

    this.warnedMissingCPR = false;
  }

  init() {
    super.init();

    if (game.modules.get("vision-5e")?.active) {
      this.defaultDetectionModes.push(
        'devilsSight',
        'etherealSight',
        'hearing',
        'witchSight'
      );
    }

    game.keybindings.register(Stealthy.MODULE_ID, "endTurn", {
      name: "stealthy.dnd5e.endTurn.name",
      hint: "stealthy.dnd5e.endTurn.hint",
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

    game.settings.register(Stealthy.MODULE_ID, 'perceptionDisadvantage', {
      name: "stealthy.dnd5e.perceptionDisadvantage.name",
      hint: "stealthy.dnd5e.perceptionDisadvantage.hint",
      scope: 'world',
      config: true,
      type: Boolean,
      default: true,
    });

    game.settings.register(Stealthy.MODULE_ID, 'stealthKey', {
      name: "stealthy.dnd5e.stealthKey.name",
      hint: "stealthy.dnd5e.stealthKey.hint",
      scope: 'world',
      config: true,
      type: String,
      default: 'ste'
    });

    game.settings.register(Stealthy.MODULE_ID, 'perceptionKey', {
      name: "stealthy.dnd5e.perceptionKey.name",
      hint: "stealthy.dnd5e.perceptionKey.hint",
      scope: 'world',
      config: true,
      type: String,
      default: 'prc'
    });

    game.settings.register(Stealthy.MODULE_ID, 'ignorePassiveFloor', {
      name: "stealthy.dnd5e.ignorePassiveFloor.name",
      hint: "stealthy.dnd5e.ignorePassiveFloor.hint",
      scope: 'world',
      config: true,
      type: Boolean,
      default: false,
    });

    game.settings.register(Stealthy.MODULE_ID, 'friendlyUmbralSight', {
      name: "stealthy.dnd5e.friendlyUmbralSight.name",
      scope: 'world',
      config: false,
      type: String,
      choices: {
        'allow': "stealthy.dnd5e.friendlyUmbralSight.allow",
        'inCombat': "stealthy.dnd5e.friendlyUmbralSight.inCombat",
        'ignore': "stealthy.dnd5e.friendlyUmbralSight.ignore"
      },
      default: 'inCombat'
    });
  }

  setup() {
    super.setup();

    const hiddenSource = game.settings.get(Stealthy.MODULE_ID, 'hiddenSource');
    const beforeV12 = Math.floor(game.version) < 12;
    if (!beforeV12) {
      const hidingAvailable = CONFIG?.DND5E.statusEffects?.hiding.name;
      if (hiddenSource === 'hiding' && hidingAvailable) {
        this.hiding = game.i18n.localize(hidingAvailable);
      }
    }

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

  buildDetectModePermission(mode, enabled) {
    let permission = super.buildDetectModePermission(mode, enabled);
    permission.lightBased = permission.enabled && mode != 'hearing';
    return permission;
  }

  getSettingsParameters(version) {
    let settings = super.getSettingsParameters(version);
    let cpr = undefined;
    if (typeof chrisPremades !== typeof undefined) {
      cpr = chrisPremades?.utils?.effectUtils?.getSidebarEffectData;
    }
    if (cpr) {
      settings.hiddenSource.choices.cpr = "stealthy.source.cpr.name";
      settings.spotSource.choices.cpr = "stealthy.source.cpr.name";
    }

    const hidingAvailable = CONFIG?.DND5E.statusEffects?.hiding.name;
    if (hidingAvailable) {
      settings.hiddenLabel.default = 'EFFECT.DND5E.StatusHiding';
      settings.hiddenIcon.default = 'systems/dnd5e/icons/svg/statuses/hiding.svg';
      settings.hiddenIcon.hint = 'stealthy.dnd5e.hiding.iconhint';
      const beforeV12 = Math.floor(game.version) < 12;
      if (!beforeV12) {
        settings.hiddenSource.choices.hiding = 'stealthy.dnd5e.hiding.choice';
        settings.hiddenSource.default = 'hiding';
        settings.hiddenSource.requiresReload = true;
      }
    }
    return settings;
  }

  static LIGHT_LABELS = ['dark', 'dim', 'bright', 'bright'];
  static EXPOSURE = { dark: 0, dim: 1, bright: 2 };

  canDetect({
    visionSource,
    tgtToken,
    detectionMode,
    lightBased,
    stealthFlag,
    stealthValue,
    perceptionFlag
  }) {
    const srcToken = visionSource.object.document;
    const source = srcToken?.actor;

    // active perception loses ties, passive perception wins ties to simulate the
    // idea that active skills need to win outright to change the status quo. Passive
    // perception means that stealth is being the active skill.
    const perceptionPair = perceptionFlag?.perception;
    const perceptionValue = (game.settings.get(Stealthy.MODULE_ID, 'perceptionDisadvantage'))
      ? this.adjustForLightingConditions({ perceptionPair, visionSource, source, tgtToken, detectionMode, lightBased })
      : this.adjustForDefaultConditions({ perceptionPair, visionSource, source, tgtToken, detectionMode });

    Stealthy.logIfDebug(`${detectionMode} vs '${tgtToken.name}': ${perceptionValue} vs ${stealthValue}`, { stealthFlag, perceptionFlag });
    return perceptionValue > stealthValue;
  }

  adjustForDefaultConditions({ perceptionPair, source }) {
    const passivePrc = source?.system?.skills?.[game.settings.get(Stealthy.MODULE_ID, 'perceptionKey')]?.passive ?? -100;
    let perception = perceptionPair?.normal
      ?? perceptionPair
      ?? (passivePrc + 1);
    return perception;
  }

  // check target Token Lighting conditions via effects usage
  // look for effects that indicate Dim or Dark condition on the token
  adjustForLightingConditions({ perceptionPair, visionSource, source, tgtToken, detectionMode, lightBased }) {
    // Extract the normal perception values from the source
    const active = perceptionPair?.normal ?? perceptionPair;
    const passivePrc = source?.system?.skills?.[game.settings.get(Stealthy.MODULE_ID, 'perceptionKey')]?.passive ?? -100;
    const value = active ?? passivePrc;
    if (!lightBased) return value;

    // What light band are we told we sit in?
    const exposure = this.getLightExposure(tgtToken) ?? 2;
    let lightBand = Engine5e.EXPOSURE[exposure];
    const oldBand = lightBand;
    switch (detectionMode) {
      case 'basicSight':
        // For vision-5e, the only way to tell darkvision from normal vision is looking at the darkvision radius.
        // zero means normal vision
        if (visionSource.radius > 0)
          lightBand += 1;
        break;
      case 'devilsSight':
        if (!lightBand) lightBand = 2;
        break;
      case undefined:
        if (visionSource.visionMode?.id === 'darkvision') lightBand += 1;
        break;
    }
    if (oldBand != lightBand)
      Stealthy.logIfDebug(`${detectionMode} vs '${tgtToken.name}': ${Engine5e.LIGHT_LABELS[oldBand]}-->${Engine5e.LIGHT_LABELS[lightBand]}`);

    // dark = fail, dim = disadvantage, bright = normal
    if (lightBand <= 0) return -100;
    if (lightBand !== 1) return value;
    return perceptionPair.disadvantaged;
  }

  getStealthFlag(token) {
    let flag = super.getStealthFlag(token);
    if (flag && flag.stealth === undefined)
      flag.stealth = flag.token.actor.system?.skills?.[game.settings.get(Stealthy.MODULE_ID, 'stealthKey')]?.passive ?? -100;
    return flag;
  }

  getPerceptionFlag(token) {
    const flag = super.getPerceptionFlag(token);
    if (flag) return flag;
    const prcKey = game.settings.get(Stealthy.MODULE_ID, 'perceptionKey');
    const passive = token.actor?.system?.skills?.[prcKey]?.passive ?? -100;
    const disadvantagedPassive = (token.actor?.flags?.['midi-qol']?.disadvantage?.skill?.[prcKey] > 0) ? passive : passive - 5;
    return {
      token,
      passive: true,
      perception: {
        normal: passive,
        disadvantaged: disadvantagedPassive
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
      await this.updateOrCreatePerceptionEffect(token.actor, { perception: value });
    } else {
      await this.bankRollOnToken(token, 'perception', value);
    }
  }

  async rollStealth(actor, roll) {
    Stealthy.log('Stealthy5e.rollStealth', { actor, roll });

    if (stealthy.stealthToActor) {
      await this.updateOrCreateStealthEffect(actor, { stealth: roll.total });
    } else {
      await this.bankRollOnToken(actor, 'stealth', roll.total);
    }

    super.rollStealth();
  }

  findStealthEffect(actor) {
    if (this.hiding) {
      return actor?.effects.find((e) => !e.disabled && this.hiding === e.name);
    }
    return super.findStealthEffect(actor);
  }

  async createSourcedEffect({ name, actor, source, makeEffect }) {
    if (source !== 'cpr')
      return super.createSourcedEffect({ name, actor, source, makeEffect });
    const beforeV11 = Math.floor(game.version) < 11;
    let effect = undefined;
    if (typeof chrisPremades !== typeof undefined) {
      effect = chrisPremades?.utils?.effectUtils?.getSidebarEffectData(name);
    }
    if (effect) {
      await actor.createEmbeddedDocuments('ActiveEffect', [effect]);
      effect = actor.effects.find((e) => name === (beforeV11 ? e.label : e.name));
    }
    else if (!this.warnedMissingCPR) {
      this.warnedMissingCPR = true;
      if (game.user.isGM)
        ui.notifications.warn(
          `${game.i18n.localize('stealthy.source.cpr.beforeLabel')} '${name}' ${game.i18n.localize('stealthy.source.cpr.afterLabel')}`);
      console.error(`stealthy | Chris's Premades couldn't find the '${name}' effect so Stealthy will use the default one. Add your customized effect to CPR or select a different effect source in Game Settings`);
    }
    return effect;
  }

  async updateOrCreateStealthEffect(actor, flag) {
    if (!this.hiding) {
      return await super.updateOrCreateStealthEffect(actor, flag);
    }

    await actor.toggleStatusEffect('hiding', { active: true });
    const beforeV11 = Math.floor(game.version) < 11;
    let effect = actor.effects.find((e) => this.hiding === (beforeV11 ? e.label : e.name));
    effect = foundry.utils.duplicate(effect);
    effect.flags.stealthy = flag;
    effect.disabled = false;
    await actor.updateEmbeddedDocuments('ActiveEffect', [effect]);
    stealthy.socket.executeForEveryone('RefreshPerception');
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
        const disadvantageRoll = await new Roll(`1d20`).evaluate();
        const delta = dice.results[0].result - disadvantageRoll.total;
        if (delta > 0) {
          perception.disadvantaged -= delta;
        }
      }
    }

    if (!game.settings.get(Stealthy.MODULE_ID, 'ignorePassiveFloor')) {
      const passivePrc = actor.system?.skills?.[game.settings.get(Stealthy.MODULE_ID, 'perceptionKey')]?.passive ?? -100;
      perception.normal = Math.max(perception.normal, passivePrc);
      const prcKey = game.settings.get(Stealthy.MODULE_ID, 'perceptionKey');
      perception.disadvantaged = Math.max(
        perception.disadvantaged,
        (actor.flags?.['midi-qol']?.disadvantage?.skill?.[prcKey] > 0) ? passivePrc : passivePrc - 5
      );
    }

    if (stealthy.perceptionToActor) {
      await this.updateOrCreatePerceptionEffect(actor, { perception });
    } else {
      await this.bankRollOnToken(actor, 'perception', perception);
    }

    super.rollPerception();
  }

  makePerceptionEffectMaker(name) {
    return (flag, source) => {
      let effect = super.makePerceptionEffectMaker(name)(flag, source);
      if (game.combat) effect.duration = { turns: 1, seconds: 6 };
      return effect;
    };
  }

  async updateOrCreatePerceptionEffect(actor, flag) {
    await this.updateOrCreateEffect({
      name: this.spotName,
      actor,
      flag,
      source: game.settings.get(Stealthy.MODULE_ID, 'spotSource'),
      makeEffect: this.makePerceptionEffectMaker(this.spotName),
      tweakEffect: (effect) => {
        if (game.combat) effect.duration = { turns: 1, seconds: 6 };
      }
    });
    stealthy.refreshPerception();
  }

}

Hooks.once('init', () => {
  if (game.system.id === 'dnd5e') {
    const systemEngine = new Engine5e();
    if (systemEngine) {
      window[Stealthy.MODULE_ID] = new Stealthy(systemEngine);
      systemEngine.init();
    }
  }
});
