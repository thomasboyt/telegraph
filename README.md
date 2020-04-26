# "telegraph" [(working title)](https://www.youtube.com/watch?v=rXXM60niKbg)

Telegraph is a port of [GGPO](https://github.com/pond3r/ggpo/), a library for P2P rollback netcode, to TypeScript.

_Rollback netcode_ is a form of [netcode](https://en.wikipedia.org/wiki/Netcode) that keeps players in sync without having to wait for all inputs to be received to execute a frame.  Telegraph is _lockstep_, meaning that the same game simulation is run for each player, using the input of local and remote players for each frame. Because of this, Telegraph only has to send _inputs_ over the wire, rather than the actual game state.

Telegraph has simple, but effective, _predictive_ netcode: any time the local simulation executes a frame but has not yet received inputs for it, it just assumes the next input for a remote player will be the same as their previous one. This is very effective for most games, especially ones with digital controls (such as keyboard-based games, controllers that use a "d-pad" for input, or analog sticks that are quantized into a relatively small number of potential directions and magnitudes).

In addition to rollback, Telegraph supports adding frame delay, a small "buffer" of frames before your local inputs are played, so that remote inputs have a higher chance of having been received before executing that frame. Unlike traditional frame delay methods, it doesn't pause when you havent't receive input for a frame, so the frame delay can be set relatively low, with prediction (and rollback) being invoked for late frames.

Check out this [excellent article by Infil](http://ki.infil.net/w02-netcode.html) for all the details of rollback networking as implemented by GGPO and Telegraph.

## Try It Out

[Play Telegraph Tennis for Two (a simple pong demo) here](https://disco.zone/telegraph/)

## Making a Telegraph Game

Telegraph, like, GGPO, requires several things of your game:

* Your game must have a _deterministic, fixed update loop_. That is, the only thing your update loop should use to update game state is a combination of previous state and new inputs. External factors like [wall time](https://en.wikipedia.org/wiki/Elapsed_real_time) or random number generation need to be synced, either by setting game state before starting telegraph (e.g. generating an RNG seed on one player, sending it to peers, and all setting it as a seed in game state), or by including it as part of the input (e.g. if one a player's current wall time is used to update state, it should be included in their input).

* Your game must have _(de)serializable state_, which can be stored in memory and rolled back to. This state does not have to be serializable in the "over the wire" sense; since Telegraph (currently) never sends game state over the network. You do need to be able to make a "deep copy" of your state, though, to avoid mutations when computing subsequent frames. The Pong demo here literally just uses `JSON.stringify()` for this since it's reasonably fast.

* Telegraph uses [PeerJS](https://peerjs.com/), a wrapper for WebRTC, for peer-to-peer data connections with UDP-like semantics (re: no ordering or delivery guarantees). It does not require an intermediary server to send data between players; however, you will need a "lobby server" like [peer-server](https://github.com/peers/peerjs-server) to connect players together. _You are in charge of bringing the connections to Telegraph before the game starts_. Telegraph does not have any built-in support for players joining after game start, though this may be added in the future (likely through methods for grabbing frame state to send to a new client and joining a new client with said state).

### tl;dr

Real docs coming soon. For now:

* Create a PeerJS connection and connect to a peer, or accept an incoming connection from a peer.
* Instantitate a new `Telegraph` class, adding local and remote players, and start your run loop.
* In your game's run loop:
  * Use a _fixed update loop_, that is, one that does not rely on a delta-time. See the pong demo and [this article](http://gameprogrammingpatterns.com/game-loop.html). Move rendering _separate_ from this update loop, e.g. in a `rAF` loop.
  * In your fixed update loop, get your input state and pass to `addLocalInput`. _If this call succeeds_, advance your frame by calling `syncInput` to gather local and remote inputs (predicted or not). If this call succeeds, call your game state's update hook with the gathered inputs.
  * Regardless of whether the frame was advanced or not, call `afterTick()` in your fixed update hook to process events.
* Create callbacks for `onSave()` and `onLoad()` that save and load serialized game state
* Create a callback for `onAdvanceFrame()` that calls `syncInput()`, runs your game state update hook, and calls `advanceFrame()` just as your regular run loop does (it does not need to call `afterTick()`).

Check out the Pong demo in the `demo/` directory for examples of this.

## Notable Differences from GGPO

* Unlike GGPO, which creates UDP sockets for you, you have to bring your own [PeerJS](https://peerjs.com/) client that already has all players connected. GGPO's model, which Telegraph follows, is to have all connection details ready before the game starts. In GGPO, this means gathering everyone's UDP address; in Telegraph, it means having an open PeerJS (WebRTC) connection. As a bonus, this makes it easy to add additional P2P messaging through the same PeerJS connection if needed.

* The runloop is... weird, since I tried to adapt C++ poll-based run loops to JS. Events are processed during the runloop ticks to prevent introducing any subtle ordering bugs, but the internal runloop is only ticked once during the "idle" phase (and idle has been renamed to an `afterTick` hook to clarify usage). Incoming messages do cause an immediate out of band runloop tick which I hope will make up for the loss of idle.

* Inputs are handled in a far more naive way, where we just send over all of the inputs for every frame instead of doing any kind of optimization for packet size/encoding speed. This could totally change in the future, but gives us flexibility for now

## Roadmap

In order of vague priority:

- [ ] Allow any form of inputs instead of just keyCodes (arbitrary serializable object)
- [ ] Replace some UDP disconnect logic with PeerJS events
- [ ] Consider extensions to PeerJS protocol for "out of game" events (e.g. initial handshake)
- [ ] Consider desync prevention protocol (maybe add to connection state in input message, `frame`/`checksum`?)
- [ ] Consider hooks to properly "crash out" on any unhandled error (force PeerJS disconnect/stop runloop/etc)
- [ ] Implement `free_buffer` callback for folks using object pools instead of relying purely on GC
- [ ] Implement TimeSync/frame-advantage fairness system
- [ ] Implement 3+ player support
- [ ] Implement debug backend (synctest)
- [ ] Implement spectators
