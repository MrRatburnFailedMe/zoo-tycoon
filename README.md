# Zoo Tycoon

A goofy-physics, first-person, low-poly zoo game that runs in the browser (Three.js + cannon-es, no build step).

Sell tickets at the front gate, ring up cash at the register, order supplies from ZooMart, pick up litter, feed the animals, drive the golf cart (mind the banana peels), and try not to get slapped by the monkeys.

Play it at https://mrratburnfailedme.github.io/zoo-tycoon/

## Play locally

```bash
python3 serve.py
```

Then open http://localhost:5173.

## Controls

- WASD to move, mouse to look, Space to jump, Shift to sprint
- Click to pick something up (walk up close first), click again to put it down
- Click to use things: doors, printer, register, card reader, golf cart, toilets, stall doors, the dumpster; E works too
- Holding something, click a person or a machine to hand it over (tickets, change, a card, a friend into the golf cart)
- Holding a trash bag, click litter to bag it; a full bag (10 pieces) goes in the dumpster for $1-$10
- Hold Q to wind up a throw, let go to throw (longer hold = harder throw)
- Hold R to look closely at what you're holding
- F to use what you're holding (radio, boxes)

## At the ticket window

1. The customer hands over cash or a card.
2. Cash: click the register while holding it, drag each note into its slot, punch in the number of tickets, click notes into the change tray, then PRINT. The tickets come out of the printer with a rubber band round them and the change lands in your hand.
3. Card: grab it, click the card reader to swipe it, then click the register empty-handed to print their tickets.
4. Hand over the tickets, the change or the card by clicking the customer.

Model credits are in [CREDITS.md](CREDITS.md).
