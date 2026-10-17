# Wheel of Fortune

A homemade version of the game show for four teams of two, run by a host from one screen. A real spinning wheel with the show's wedges, the puzzle board with tiles that light up and turn, toss-ups, the Mystery Round, the Express, the Prize Puzzle, the Wild Card, the Million Dollar Wedge, the Final Spin, and the Bonus Round with its envelope wheel.

The site republishes itself on GitHub Pages whenever you change a file on the `main` branch, usually within a minute.

## How a game works

Episode 1 runs like a current episode of the show:

1. **Toss-Ups, $1,000, $2,000 and $3,000.** Press **Space** and letters fill in at random. The first team to ring in (slap the table) gets one guess: press their number, **1–4**, then **Enter** if they're right or **Esc** if not. A team that misses is locked out and the letters keep coming. If the board is down to one letter and nobody has it, nobody wins it. Toss-up money is banked straight away. Whoever wins the $3,000 toss-up spins first in Round 1. After that, the team to the left of the last round's starter spins first, so in Rounds 1–4 every team starts one.
2. **Round 1** ($2,500 top wedge). The team in control spins, buys a vowel, or solves.
   - **Spin** (**Space**). The wheel spins with a random pull and stops under the arrow at the top, which takes the color of the team that spun. Type the consonant they call. Each one in the puzzle is worth the wedge they landed on. A letter that isn't there, or was already called, passes play to the next team.
   - **Buy a vowel** for $250 by typing it (they need $250 in the round).
   - **Solve:** **Enter** if they got it, **Esc** or **Wrong solve** if not.
   - **Bankrupt** wipes out the round's money (and the Wild Card, and an unsolved prize or Million Dollar Wedge). **Lose a Turn** passes play.
   - Solving banks the round's money, at least $1,000. Everyone else's round money is gone.
3. **Round 2, the Mystery Round.** Two Mystery wedges are worth $1,000 a consonant. After a right letter on one, the team keeps the money or gives it up to flip the wedge: one side is $10,000, the other Bankrupt. Once one is flipped, the other is just $1,000.
4. **Round 3, the Prize Puzzle,** with the **Express** wedge: $1,000 per consonant, and then the team can hop on. Riding the Express means no more spinning — consonants are $1,000 each and vowels $250 — but any miss or wrong solve is Bankrupt. Solving the puzzle also wins the prize written in the episode file.
5. **Triple Toss-Up.** Three toss-ups in a row from one category, $2,000 each. The three puzzles go together — in Episode 1 they're breakfast, lunch and dinner — so once a team spots the pattern, the later ones can be solved from the blank spaces alone. Winning the third starts Round 4. A team that wins all three gets $4,000 more.
6. **Round 4,** with the $5,000 wedge.
7. **Final Spin.** In Round 5 it starts right away; in Round 4 you can call it any time with **⏱ Final Spin** when the night is running long, like the time chime on the show. The team in control spins once (Bankrupt or Lose a Turn just spins again). The wedge plus $1,000 is what every consonant is worth for the rest of the puzzle, and vowels are free. Teams take turns calling one letter each; after a right letter they get 5 seconds to solve. The game ends when it's solved.
8. **Bonus Round.** The leader picks one of three categories and spins the envelope wheel; the envelope stays sealed. R S T L N E go up, the team calls three more consonants and a vowel (a fourth consonant if they kept the Wild Card), type them, press **Space** to show them, and **Space** again starts the 10-second clock. **Enter** if they solve it. Then open the envelope. If they kept the Million Dollar Wedge, one envelope on the bonus wheel is $1,000,000.

If the top teams are tied at the end, a tiebreaker toss-up decides it.

**Partners take turns at the wheel.** Each time a team gets control, the screens show which of the two is up.

**The Wild Card, the prize wedge and the Million Dollar Wedge** sit on the wheel in Rounds 1–4 until someone picks them up with a right consonant. The Million Dollar Wedge has a Bankrupt on each side; where the arrow stops within the wedge decides which. Icons on each team's podium show what they're holding (a dashed outline means it's not banked yet). After a right consonant, a team holding the Wild Card can press **Use Wild Card** to call a second consonant at the same value — or save it for the Bonus Round.

### Host shortcuts

- **Space:** the obvious next step — spin, start or pause a toss-up, next round, start the bonus clock
- **A–Z:** call that letter (after a spin, a vowel to buy, Express and Final Spin letters, Bonus Round picks)
- **1–4:** a team rings in on a toss-up
- **Enter:** solved it
- **Esc:** wrong, or time's up and play passes
- **Ctrl+Z / ⌘Z:** undo the last thing you did
- Click a team's podium to give them control if play got out of order
- **0:** show or hide the play-along leaderboard on the TV

The game saves itself in the browser, so a refresh or a closed tab won't lose a game in progress — you'll see a **Resume** button.

## Host screen and board

Same as Family Feud: two tabs in the same browser on one computer.

- **Host screen** (the normal site address): the controls, a small copy of the wheel, and the answer.
- **Board** (press **📺 Open board**, or add `?view=board` to the address): the puzzle board, the category, used letters and the podiums. When someone spins, it cuts to the wheel and back, like the show.

To put the board on the TV:

- **Chromecast / Google TV:** on the board tab, open Chrome's ⋮ menu → **Cast…**, and under **Sources** choose **Cast tab**.
- **HDMI or AirPlay as a second display:** drag the board window onto the TV and press **F** on it for full screen. Use "extend" rather than "mirror".

Click the board once after it opens so the browser lets it play sound; the sounds then come out of the TV.

## Audience play-along

Everyone who isn't on a team can solve along on their phone, with a leaderboard that runs all game. It works like Dim Sum Rush: messages go through a free public relay, so there's nothing to sign up for or set up.

1. On the team setup screen, press **Turn on play-along**. You get a 5-letter room code, and a QR code shows up on the TV's title screen.
2. People scan the QR code (or go to the site address with `/play` on the end and type the room code), enter a name, and they're in. People can join any time; the room code stays in the corner of the TV.
3. Each puzzle shows up on their phone as soon as it's on the board, with the same blank spaces and revealed letters the TV shows. They get **one guess per puzzle** — the whole answer. Capitals, spaces and punctuation don't matter.
4. **Scoring:** a right answer is worth up to 1,000 points, depending on how much of the puzzle was still hidden when they locked it in. Lock in with every letter still blank and it's 1,000; with 30% still hidden it's 300. A wrong guess is worth nothing. Every puzzle uses the same scale, toss-ups and the Bonus Round included.
5. **No spoilers:** phones only say "Locked in" until the puzzle is solved on stage, and the answer never reaches the phones before then, so nobody in the audience can tip off a team.
6. When a puzzle is solved, everyone's phone shows how they did, and a few seconds later the TV shows the top five and the fastest solver. The leaderboard goes away when the next puzzle starts. Press **0** to show or hide it any time — for example after the Bonus Round envelope, where it doesn't come up on its own so the envelope gets its moment. The Final Scores screen shows the play-along leaderboard next to the teams.

Your host screen shows how many people have joined and how many have locked in on the current puzzle (and how many are right — only you see that).

If you refresh the host tab, play-along comes back with the same room code and everyone's scores. Phones reconnect by themselves if they sleep or lose Wi-Fi for a moment. **Reset scores** starts the leaderboard over, and **New room code** opens a fresh room (everyone has to join again). Scores carry over if you press **Play again**.

The host tab has to stay open, since it's what checks the guesses. Messages go through public relays that anyone could listen in on, so the play-along never sends an answer before it's solved on stage — fine for a party, but don't use it for anything private.

## Editing the puzzles

Each episode is a file in `games/`. Edit one on github.com with the pencil icon and commit.

```json
{
  "title": "Episode 1",
  "giftPrize": "A mystery gift",
  "rounds": [
    { "type": "tossup", "value": 1000, "category": "Phrase", "puzzle": "BETTER LATE THAN NEVER" },
    { "type": "tossup", "value": 2000, "category": "Living Thing", "puzzle": "A LITTER OF PUPPIES" },
    { "type": "tossup", "value": 3000, "category": "Fun & Games", "puzzle": "CHUTES AND LADDERS", "decidesStart": true },
    { "type": "round", "wheel": 1, "category": "Before & After", "puzzle": "HOT DOG DAYS OF SUMMER" },
    { "type": "round", "wheel": 2, "category": "What Are You Doing?", "puzzle": "SINGING IN THE SHOWER" },
    { "type": "round", "wheel": 3, "category": "Place", "puzzle": "A CABIN IN THE MOUNTAINS", "prize": "A mountain cabin getaway" },
    { "type": "triple", "value": 2000, "category": "Food & Drink", "puzzles": ["BREAKFAST / IN BED", "LUNCH ON / THE GO", "DINNER AND / A MOVIE"] },
    { "type": "round", "wheel": 4, "category": "Rhyme Time", "puzzle": "SNUG AS A BUG / IN A RUG" },
    { "type": "round", "wheel": 4, "category": "Event", "puzzle": "A SURPRISE BIRTHDAY PARTY", "speedUp": true }
  ],
  "tiebreaker": { "category": "Phrase", "puzzle": "TIME WILL TELL" },
  "bonus": {
    "categories": [
      { "category": "Phrase", "puzzle": "JUST MY LUCK" },
      { "category": "Place", "puzzle": "COUNTRY ROAD" },
      { "category": "Thing", "puzzle": "WARM BLANKET" }
    ],
    "envelopes": [40000, 45000, 50000, "A new car", 100000]
  }
}
```

| Field | What it does |
| --- | --- |
| `rounds` | Played in order |
| `type` | `"tossup"`, `"triple"` or `"quadruple"` (a set of toss-ups; `puzzles` has 3 or 4), or `"round"` (the wheel) |
| `wheel` | Which wheel a round uses: `1` ($2,500 top, Wild Card, prize and Million Dollar wedges), `2` (Mystery wedges, $3,500 top), `3` (Express, $3,500 top), `4` ($5,000 top) |
| `top` | On a round: the top-dollar wedge's value, if it should be different from that wheel's usual one (Episode 1's Round 2 uses wheel `1` with `"top": 3500`) |
| `sweepBonus` | On a toss-up set: the extra money for winning every puzzle in it (default 4000) |
| `puzzle` | The answer. It's laid out on the board for you; put a `/` where you want a line to break. Lines can be up to 12 letters on the top and bottom rows and 14 in the middle two. Punctuation (`'` `-` `&` `?`) shows from the start |
| `prize` | On a round: makes it a Prize Puzzle; the team that solves it wins this |
| `speedUp` | On a round: it starts with the Final Spin |
| `decidesStart` | On a toss-up: the winner spins first in the next round (the last toss-up before Round 1 does this anyway) |
| `giftPrize` | What the prize wedge on the wheel gives away |
| `tiebreaker` | Optional toss-up if the top teams are tied |
| `bonus.envelopes` | Up to 24 prizes for the bonus wheel: numbers show as dollars, or write anything in quotes |

A puzzle that won't fit on the board stops the episode from loading and says which one. To add an episode, copy `games/episode1.json`, rename it, and add it to `games/index.json`:

```json
{ "id": "episode2", "title": "Episode 2", "description": "Anything you like" }
```

If a file has a typo that breaks the JSON, the deploy fails with a red ✗ on the repo's **Actions** tab and the site keeps the last working version.

## The wheel

The wedge values match the show's current set, but the show doesn't publish the order of its wedges, so the order is our own. It's the list at the top of `js/wheel.js` if you want to rearrange it.

## Sounds

Every cue has a built-in sound — the letter ding, the buzzer, Bankrupt, the pegs clicking past the flapper, the solve, the clocks, the Final Spin chime — so the game sounds right with nothing added. To use your own audio for any of them, drop a file into `sounds/` with the name below; it plays in place of the built-in one. The two music cues only play if you add a file.

| File | When it plays |
| --- | --- |
| `theme.mp3` | Title screen and team setup (loops) |
| `bonus.mp3` | Choosing the Bonus Round category and spinning (loops) |
| `ding.mp3` | Each letter lighting up on the board |
| `buzzer.mp3` | Letter not in the puzzle, already called, wrong solve |
| `bankrupt.mp3` | Bankrupt |
| `lose-turn.mp3` | Lose a Turn |
| `peg.mp3` | Each peg the flapper hits during a spin |
| `solve.mp3` | A puzzle is solved |
| `tossup.mp3` | Toss-up music while the letters fill in (loops; pauses when a team rings in or you pause, resumes with the reveal). A built-in loop plays if this file is missing |
| `tossup-letter.mp3` | A letter popping in during a toss-up |
| `ring-in.mp3` | A team rings in |
| `no-more.mp3` | "No more vowels" / "Only vowels remain" |
| `time-up.mp3` | The Final Spin |
| `tick.mp3` | Each second of the speed-up and bonus clocks |
| `clock-out.mp3` | A clock runs out |
| `mystery.mp3` | Flipping a Mystery wedge |
| `express.mp3` | Getting on the Express |
| `claim.mp3` | Picking up the Wild Card, a prize, or the Million Dollar Wedge |
| `envelope.mp3` | Opening the Bonus Round envelope |
