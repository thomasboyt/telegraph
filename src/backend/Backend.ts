
import { Player, PlayerHandle, TelegraphNetworkStats } from '../types';

import {

  ValueResult,
  VoidResult,

  VoidOk,
    DisconnectResult,
    NetstatsResult,
    FrameDelayResult,

  ResultOk,
  ResultInvalidPlayerHandle,
  ResultPlayerAlreadyDisconnected,
  AddLocalInputResult,
  AddPlayerResult,
  SyncInputResult,

} from '../resultTypes';





export abstract class Backend {

  abstract addPlayer(player: Player)                            : AddPlayerResult;
  abstract addLocalInput(handle: PlayerHandle, input: number[]) : AddLocalInputResult;
  abstract syncInput()                                          : SyncInputResult;
  abstract incrementFrame()                                     : VoidOk;
  abstract disconnectPlayer(handle: PlayerHandle)               : DisconnectResult;
  abstract getNetworkStats(handle: PlayerHandle)                : NetstatsResult;
  abstract setFrameDelay(handle: PlayerHandle, delay: number)   : FrameDelayResult;
  abstract postProcessUpdate()                                  : void;

  // chat(text: string): ResultOk;  // this isn't actually implemented in GGPO's backends but exists in the API

}
