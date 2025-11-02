# Sparkle

Copyright 2025 Limitless Knowledge Association. Open sourced under MIT license.

## Objective

Sparkle is a system to keep track of all the details.

At its heart, there are *items* which may participate in dependency graphs.

An item A *depends* on another item B if in order for A to be marked as complete, B must already be completed.

Items may have descriptions and status settings. Each change of status or description is time/date stamped. Descriptions are made in entries. An entry is write-once and immutable. Of course, one is free to add more entries to clarify.

Status settings are from a finite set. There is always a completed and incomplete. The set of valid status may be increased per instance. When creating an object it may not be completed and may be any other legal status. Defaults to incomplete.

There are *people* who may monitor any item as they chose.

Each item has a person who filed it, which is immutable. It also has an optional person assigned.

## Implementation

The system uses a dedicated git branch to hold its data. The data is added into the branch via an API. Using this approach, git acts as both the database and the transport layer.

This means git must be fetched periodically. There's no reason to hammer git, this system isn't meant for hard real-time user. Every ten or fifteen minutes is probably fine. It should of course fetch before applyiing a change, and push immediately after applying a change (and deal with collisions as needed).

This system does not interact with the workspace at all. It's transparent to any system that uses it.

On each addition the user and the working git commit is included. This makes it possible (though not necessarily automatic or easy) to review what might have been in process at the time, by looking at the next commit. It only includes the working commit that was last in origin (so it won't track local-only branches, but will rather track their original branching point).

## The API

The API is a functional api imported from the file sparkle.js.

In the examples, the following is assumed:

```
    import * as sparkle from "./sparkle";
```

## Users

The users are identified by their git identity. Thus, there is no effort to create users. Rather, their email address and real name are used from git. If a git user updates this, their links to the prior things will not be useful.

## Items

Items may be created and updated. There is no notion of deletion.

Items must be created before they can be updated. There is no upsert.

### Creation

To create an item:

```
    const tagline = "The short description";
    const item = await sparkle.createItem(tagline); // defaults to incomplete
    const item = await sparkle.createItem(tagline, "unassigned"); // alternative status
```

There is no requirement that tagline be unique.

The create call makes a new object, assigns an identity, and adds the creator and tagline. It also adds a UTC timestamp.

The object is a JSON file name `<item>.json`.

The tagline is `<item>.tagline.<ymdhms>.<random>.json`.

The item returned is the item identifier. It is not an object, just a simple string.

Should an attempt be made to create an item with a status of completed an exception will be thrown.

### Fetching

If an item identifier is known, the details of the item can be fetched:

```
    const details = await sparkle.getItemDetails(item);
```

Details will be a normal JS object `{}` that is a deep copy, so any alterations to it will not affect any operations within the library.

### Tagline Alteration

Since the tagline is not a key, just a useful note, it's freely altered (but may never be empty or solely whitespace).

```
    await sparkle.alterTagline(item, tagline);
```

Nothing is returned.

he tagline is `<item>.tagline.<ymdhms>.<random>.json`.


### Adding a New Entry

An Entry is an arbitrary block of text along with its creator (same data as creating an item). It is associated with its item by including the item identity.

It is a well-formed JSON object created by the following call:

```
    await sparkle.addEntry(item, arbitraryTextBlock);
```

The JSON object lives in its own file and its filename is the `<item>.entry.<ymdhms>.<random>.json`.

### Status Update

A status is tracked on the item as a whole. The history of status changes (including by whom and when) is tracked per item. The most recent udpate is the current status.

The status chosen is validated against the list of known statuses.

```
    await spark.updateStatus(item, status, arbitraryTextBlock);
```

This makes the same sort of well-formed JSON object and stores it as `<item>.status.<ymdhms>.<random>.json`.

If the status attempts to change to complete and any dependency is unmet this throws an exception.

The json is the details of the peron who made the change.

### Adding a Dependency

There is only one sort of dependency: a depends on b if in order for a to be completed b must also be completed.

Anything can be added as a dependency at any time. Adding a dependency to something already completed marks it incomplete.

```
    const itemNeeding = ...;  // get an item that needs another
    const itemNeeded = ...; // get the item needed by the other
    await sparkle.addDependency(itemNeeding, itemNeeded);
```

Any attempt to create a circular dependency will throw an exception.

Dependencies are stored as `<itemNeeding>.dependency.linked.<itemNeeded>.<ymdhms>.<random>.json`.

The JSON holds the person details of who created it.

### Removing a Dependency

To remove a dependency is to add a removal record. The history of dependencies is permanent.

```
    await sparkle.removeDependency(itemNeeding, itemNeeded);
```

This will throw an exception if the pair isn't active.

It creates (not deletes!) a file: `<itemNeeding>.dependency.unlinked.<itemNeeded>.<ymdhms>.<random>.json`.

The json holds the details of the person who removed the link.

### Person Chooses to Monitor an Item

When someone wants to follow an item, they can monitor it.

```
    await spark.addMonitor(item);
```

This creates a file `<item>.monitor.added.<hash>.<ymdhms>.<random>.json`.

The hash is sha256 of the JSON, which is the standarddetails of the person who added themselves.

NOTE: it's not possible to force someone to monitor!

An attempt to monitor when there's already a monitor added of that ID will be ignored, but will not throw an exception.

### Person No Longer Monitors an Item

When a person doesn't care anymore about update notifications, they can stop monitoring.

```
    await sparkle.removeMonitor(item);
```

Removing a monitor when not monitoring is harmless and ignored.

The removal creates a file `<item>.monitor.removed.<hash>.<ymdhms>.<random>.json`.

A person can add and remove as often as they wish.
