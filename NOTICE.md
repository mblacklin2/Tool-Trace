# Credits and third-party notices

**Multiboard** is a project by Jonathan K (Keep Making / MultiBuild). Tool-Trace is an independent tool and is not affiliated with or endorsed by Multiboard. Check Multiboard's licence terms before selling printed Multiboard-compatible parts.

**Mount profiles**
- Multiconnect receiver profile (DavidD's Multiconnect), as published in QuackWorks by Andy Levesque (BlackjackDuck) and Hands on Katie – QuackWorks is licensed CC BY-NC-SA 4.0. Only dimensional values are used here.
- "Multipoint Beta" dovetail spec from QuackWorks (credited there to SnazzyGreenWarrior). Community beta – verify with the fit-test coupon.
- Multiboard tile thread and hole dimensions as documented in asciipip/multiboard-parametric-stacked.

**Code**
- Polygon triangulation is a port of the [earcut](https://github.com/mapbox/earcut) algorithm – ISC License, Copyright (c) 2016, Mapbox.
- Solid booleans follow the BSP approach of [csg.js](https://github.com/evanw/csg.js) – MIT License, Copyright (c) 2011 Evan Wallace.
- The Euclidean distance transform follows Felzenszwalb & Huttenlocher, "Distance Transforms of Sampled Functions" (2012).

**AI trace (loaded at runtime, not bundled)**
- [Transformers.js](https://github.com/huggingface/transformers.js) – Apache License 2.0, loaded from cdn.jsdelivr.net.
- [Xenova/slimsam-77-uniform](https://huggingface.co/Xenova/slimsam-77-uniform) model weights (SlimSAM, derived from Meta's Segment Anything) – see the model card for its licence, loaded from huggingface.co.
