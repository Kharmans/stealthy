[![License](https://img.shields.io/github/license/eligarf/stealthy?label=License)](LICENSE)
[![Latest Version](https://img.shields.io/github/v/release/eligarf/stealthy?display_name=tag&sort=semver&label=Latest%20Version)](https://github.com/eligarf/stealthy/releases/latest)
![Foundry Version](https://img.shields.io/endpoint?url=https://foundryshields.com/version?url=https%3A%2F%2Fraw.githubusercontent.com%2Feligarf%2Fstealthy%2Fmain%2Fmodule.json)

# Stealthy

A module for [FoundryVTT](https://foundryvtt.com) that adds perception vs stealth testing to Foundry's visibility tests.

## Purpose

During visibility tests, Stealthy filters out any objects with the 'Hidden' condition if the viewing Perception value fails to beat the object's Stealth value.

## Features

### **Rolling Stealth checks applies the Hidden condition**
Rolling a Stealth skill check will apply the 'hidden' condition to the actor and record the result of the check in that condition for later comparisons, replacing the stored result if the Hidden condition is already present. If using DFreds Convenient Effects, a custom Hidden effect will be created therein if no custom effect named Hidden can be found. This effect can be customized as you see fit, but it must remain named 'Hidden'.

![stealth-roll](https://user-images.githubusercontent.com/16523503/209896032-4b1ea031-0efc-4320-8b99-7e6fb7d722e6.gif)

![stealth-roll](https://user-images.githubusercontent.com/16523503/209896032-4b1ea031-0efc-4320-8b99-7e6fb7d722e6.gif)

### **Rolling Perception checks applies the Spot condition**
Rolling a Perception check will add a 'Spot' condition to the actor which records the result of that perception check. The passive value for Perception is used if this condition isn't present on the actor. *The stored Perception result uses the passive value as a floor*

![perception](https://user-images.githubusercontent.com/16523503/209896029-c3df27ab-2936-494a-91ed-f1e445a24e37.gif)

### **GM Stealth Override**
Once the 'Hidden' condition is applied, GMs will see a token button with an input box on the bottom right which will shows the rolled Stealth result, or show the passive Stealth value if the Hidden condition was added directly without rolling. Changing the value in this input box will alter the stored Stealth result for any future visibility tests.

![stealth-override](https://user-images.githubusercontent.com/16523503/209896031-675ab0e3-93e6-4d9c-8eeb-c11abe39fdab.gif)

### **Umbral Sight affects darkvision**
Characters with Umbral Sight will no longer be visible to the Darkvision mode, but they can still be seen if Basic Vision can see them. The GM has the option to disable this for friendly token visibility tests.

![umbral-sight](https://user-images.githubusercontent.com/16523503/209896483-6aa52e98-9d76-43ab-ad8b-141b3852fb93.gif)

### **Invisible characters can hide from See Invisibility**
An invisible actor that also has the 'Hidden' condition will check Perception vs Stealth before showing up in the 'See Invisibility' vision mode.

### **Friendly tokens can still be viewed**
The GM has the option for allowing Hidden tokens to be seen by other tokens of the same disposition.

## Required modules
* [lib-wrapper](https://foundryvtt.com/packages/lib-wrapper)
## Optional modules
* [DFreds Convenient Effects](https://foundryvtt.com/packages/dfreds-convenient-effects)
* [Combat Utility Belt](https://foundryvtt.com/packages/combat-utility-belt)
* [Token Magic FX](https://foundryvtt.com/packages/tokenmagic)
* [Active Token Effects](https://foundryvtt.com/packages/ATL)
