# Nexus: a people library

## The thing itself

A library, not a database.

The distinction is not cosmetic. You do not maintain a library entry by entry.
It accumulates, it is organised so you can find things, and its value is
entirely in retrieval at the moment you need something, not in the storing. A
database asks you to keep it correct. A library asks nothing of you at all.

Every personal CRM ever built has failed at exactly this point. They are
databases wearing a friendly coat: they ask you to add the contact, tag the
contact, log the interaction, set the reminder, rate the relationship. The
maintenance cost always exceeds the retrieval value, so people stop, and a
half-maintained relationship database is worse than none because you cannot
trust what it tells you.

Nexus never asks. Conversations arrive from wherever they were recorded, people
appear because you spoke to them, and the record assembles itself.

## The uncomfortable question a network tool has to answer

What is a professional relationship, mechanically?

Not "how warm do you feel about someone". Not a score. A professional
relationship is **a sequence of exchanges in which things were promised and
either delivered or not.** That is the whole of it. Everything else is a proxy.

Which means the most valuable thing in a transcript is not the summary. It is
the sentence "I'll send that over by Friday."

Those sentences are the actual substance of a working relationship, they are
spoken aloud in almost every professional call, they are recorded verbatim by
every notetaker on the market, and **not one product does anything with them.**
They evaporate the moment the call ends. People fall back on memory, inbox
archaeology, and the quiet embarrassment of "sorry, did I ever send you that?"

A running inventory of what was promised, in both directions, across every
relationship, assembled without anyone typing anything, is a thing that does
not currently exist.

## Both directions, which is the point

Most network tools are extraction machines. They help you work out who to ask
for what. They are, in a word, taking.

The commitments ledger is symmetric by construction, and that changes what the
product is for:

- **What you owe.** The intro you promised, the data room link, the feedback on
  the deck. Unglamorous, easily forgotten, and the entire basis of whether
  people find you reliable.
- **What you are owed.** The cohort data, the follow up, the answer. Not for
  chasing people, but so you stop wondering whether the ball is in your court.

A professional's reputation is built almost entirely out of the first list.
People do not remember your insights; they remember whether you did the thing
you said you would do. A product that makes you 20% better at closing your own
loops is worth more to your network than any amount of relationship analytics,
and it is worth more to you, because reliability compounds.

**So the measure of this product is not how much you extract from your network.
It is whether it makes you someone worth being in a network with.**

## Principles

**Accumulation over administration.** If a feature requires upkeep, it is
wrong. Anything that asks the user to maintain state is a design failure to be
solved, not a feature to be scoped.

**Evidence, not interpretation.** What a source wrote is shown verbatim and
always wins. What a model wrote is marked and coloured differently. Nothing is
scored. A commitment is a quote, not a judgement, and it can be traced back to
the sentence it came from.

**Describe, never rate.** "Every 24 days, and it has been three months" is
actionable and true. "Relationship health: 62" is neither. The shape is the
analysis.

**Retrieval at the moment of need.** The library earns its keep by handing you
the right page fifteen minutes before the meeting, not by having stored
everything faithfully. Storage is table stakes; timing is the product.

**Refuse to guess.** A wrong link is invisible once made and everything built
on top inherits it. Ambiguity goes to a human, and the queue is designed to be
cleared in one click, because a refusal you cannot act on is just a failure
with better manners.

## What this makes possible later

Once commitments are structured, several things stop being features and start
being consequences.

The pre-meeting brief becomes obvious: here is the person, here is what you
last discussed, here are the two things you owe them and the one thing they owe
you. That is the entire product surfaced at the only moment it matters.

Reciprocity becomes visible: what you have given a relationship versus what you
have taken from it, which is the number a thoughtful professional actually
wants and nobody currently has.

And the network view finally has something honest to draw. Not a spider diagram
of who knows whom, which is decorative, but a map of where value has genuinely
flowed.

## What we are not building

Not a pipeline. Not a scoring engine. Not a spider graph. Not a place to
manually enrich anybody. Not a tool for working out who to extract from.

Those are all easy to add and each one would pull the product back towards
being a CRM, which is the thing that already exists and already does not work.

## The longer bet

As agents absorb the transactional layer of work, what does not get absorbed is
trust, judgement, reciprocity and reputation. Those are properties of
relationships between people, and they are the residue left when everything
automatable has been automated.

Which suggests where this ends up. An agent acting on your behalf, scheduling,
drafting, negotiating, introducing, needs to know your social state or it will
be confidently, expensively clumsy. It needs to know that you owe this person
two things, that you have not delivered on the last one, that they are looking
for a lead investor, that you have taken more from this relationship than you
have given. Without that context an agent will optimise a calendar and quietly
damage a friendship.

**A structured, provenance-backed ledger of interpersonal commitments is
exactly the context layer that problem needs, and nobody is building it.** Not
a contact list, not a CRM export: what was promised, by whom, whether it
happened, and what each side is looking for. That is a small, clean interface
an assistant could consume, and it is the reason to build the shapes carefully
now even while the product is still a prototype.

So the data model is designed as though something else will read it. Every
commitment has an owner and a state. Every signal keeps the quote it came from.
Every link records how confident we are and why. Not because a prototype needs
that rigour, but because an agent acting on unverifiable inference is dangerous
in a way a human skimming a page is not.

### One line we should not cross

There is a version of this framed as training data for human interaction, and
it is worth naming why that version is wrong rather than leaving it to be
discovered later.

These transcripts are other people's speech, recorded in private professional
conversations. The counterparty consented to a meeting, not to a corpus. Using
their words to train a general model would be a real breach of that, and it
would also be self-defeating: the entire product rests on the user trusting it
with the most sensitive record they own. That trust does not survive discovering
their conversations became someone's training set.

**Your own assistant reading your own ledger on your behalf is a different
thing entirely, and it is the version worth building.** The distinction is not
legal hair-splitting. It is the difference between a tool that makes you a
better counterparty and one that quietly makes its users into a product.
