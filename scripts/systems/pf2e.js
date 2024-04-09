import { Stealthy } from '../stealthy.js';
import Engine from '../engine.js';

async function wait(ms) { return new Promise(resolve => { setTimeout(resolve, ms); }); }

export class EnginePF2e extends Engine {

  constructor() {
    super();

    const workbench = game.modules.get('xdy-pf2e-workbench')?.active;
    if (!workbench) {
      Hooks.once('ready', async () => {
        ui.notifications.error(`${game.i18n.localize('stealthy.pf2e.dependency')}`);
      });
    }

    Hooks.on('createChatMessage', async (message, options, id) => {
      // Stealthy.log('createChatMessage', message);
      const pf2eContext = message.flags.pf2e.context;
      switch (pf2eContext?.type) {
        case 'perception-check':
          if (pf2eContext?.options.includes('action:seek')) {
            await this.rollPerception(message, options, id);
          }
          break;
        case 'skill-check':
          const hidden = ['action:hide', 'action:create-a-diversion', 'action:sneak'];
          if (pf2eContext?.options.some((t) => hidden.includes(t))) {
            await this.rollStealth(message, options, id);
          }
          break;
        case 'initiative':
          if (pf2eContext?.domains.includes('stealth')) {
            await this.rollStealth(message, options, id);
          }
          break;
      }
    });
  }

  patchFoundry() {
    // Generic Detection mode patching

    const sightModes = [
      'basicSight',
      'feelTremor',
      'hearing',
      'seeAll',
      'seeInvisibility',
    ];
    for (const mode of sightModes) {
      console.log(`Stealthy | patching ${mode}`);
      libWrapper.register(
        Stealthy.MODULE_ID,
        `CONFIG.Canvas.detectionModes.${mode}._canDetect`,
        function (wrapped, visionSource, target) {
          Stealthy.log(`testing ${mode}`, { visionSource, target });
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
  }

  findHiddenEffect(actor) {
    return actor?.getCondition('hidden');
  }

  findSpotEffect(actor) {
    return actor?.items.find(i => i.name === 'Seeking');
  }

  canDetectHidden(visionSource, hiddenEffect, tgtToken, detectionMode) {
    const stealth = hiddenEffect?.flags?.stealthy?.hidden ?? (10 + tgtToken.actor.system.skills.ste.value);
    const source = visionSource.object?.actor;
    const seeking = this.findSpotEffect(source);
    const perception = seeking?.flags?.stealthy?.spot ?? 10 + source.system.attributes.perception?.value;

    return perception >= stealth;
  }

  makeHiddenEffectMaker(label) {
    Stealthy.log('PF2e.makeHiddenEffectMaker not used in PF2e');
    return (flag, source) => null;
  }

  makeSpotEffectMaker(label) {
    Stealthy.log('PF2e.makeSpotEffectMaker not used in PF2e');
    return (flag, source) => null;
  }

  async updateOrCreateEffect({ label, actor, flag, source, makeEffect }) {
    Stealthy.log('PF2e.updateOrCreateEffect not used in PF2e');
    return null;
  }

  async updateOrCreateHiddenEffect(actor, flag) {
    const lowerLabel = this.hiddenLabel.toLowerCase();
    if (!actor.hasCondition(lowerLabel)) {
      await actor.toggleCondition(lowerLabel);
    }
    const condition = actor.getCondition(lowerLabel);
    let update = duplicate(condition.toObject(false));
    update.flags.stealthy = flag;
    await actor.updateEmbeddedDocuments('Item', [update]);
    stealthy.socket.executeForEveryone('RefreshPerception');
  }

  getHiddenFlagAndValue(actor, effect) {
    const value = effect.flags.stealthy?.hidden ?? (10 + actor.system.skills.ste.value);
    return { flag: { hidden: value }, value };
  }

  async setHiddenValue(actor, effect, flag, value) {
    flag.hidden = value;
    effect.flags.stealthy = flag;
    await actor.updateEmbeddedDocuments('Item', [effect]);
    stealthy.socket.executeForEveryone('RefreshPerception');
  }

  async updateOrCreateSpotEffect(actor, flag) {
    let seeking = this.findSpotEffect(actor);
    if (!seeking) {
      const effect = {
        "name": "Seeking",
        "type": "effect",
        "effects": [],
        "system": {
          "description": {
            "gm": "",
            "value": ""
          },
          "slug": "seeking",
          "traits": {
            "value": []
          },
          "level": {
            "value": 1
          },
          "duration": {
            "value": 1,
            "unit": "rounds",
            "sustained": false,
            "expiry": "turn-start"
          },
          "tokenIcon": {
            "show": true
          },
          "unidentified": false
        },
        "img": game.settings.get(Stealthy.MODULE_ID, 'spotIcon'),
        "flags": {
          "stealthy": flag
        },
      };
      await actor.createEmbeddedDocuments('Item', [effect]);
    }
    else {
      let update = duplicate(seeking.toObject(false));
      update.flags.stealthy = flag;
      await actor.updateEmbeddedDocuments('Item', [update]);
    }
    canvas.perception.update({ initializeVision: true }, true);
  }

  getSpotFlagAndValue(actor, effect) {
    const value = effect?.flags.stealthy.spot ?? (10 + actor.system.attributes.perception?.value);
    return { flag: { spot: value }, value };
  }

  async setSpotValue(actor, effect, flag, value) {
    flag.spot = value;
    effect.flags.stealthy = flag;
    await actor.updateEmbeddedDocuments('Item', [effect]);
  }

  async rollPerception(message, options, id) {
    Stealthy.log('rollPerception', { message, options, id });
    let check = Number(message.content);

    // Easier to track for Critical success/failure if we just bump the result by +/- 10
    const die = message.rolls[0].dice[0];
    if (die.total == 20) check += 10;
    else if (die.total == 1) check -= 10;

    const token = canvas.tokens.get(message.speaker.token);
    const actor = token.actor;
    await this.updateOrCreateSpotEffect(actor, { spot: check });

    super.rollPerception();
  }

  async rollStealth(message, options, id) {
    Stealthy.log('rollStealth', { message, options, id });
    const check = Number(message.content);

    const token = canvas.tokens.get(message.speaker.token);
    const actor = token.actor;
    await this.updateOrCreateHiddenEffect(actor, { hidden: check });

    super.rollStealth();
  }
}

Hooks.once('init', () => {
  if (game.system.id === 'pf2e') {
    const systemEngine = new EnginePF2e();
    if (systemEngine) {
      window[Stealthy.MODULE_ID] = new Stealthy(systemEngine);
    }
  }
});
