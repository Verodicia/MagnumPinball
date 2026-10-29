import { ArcadeDecal } from './ArcadeDecal';
import { BumperPost } from './BumperPost';
import { DropTargetBank } from './DropTargetBank';
import { Gate } from './Gate';
import { KickoutHole } from './KickoutHole';
import { LaneDivider } from './LaneDivider';
import { LightInsert } from './LightInsert';
import type { ModuleDef, PlayfieldModule } from './PlayfieldModule';
import { PopBumper } from './PopBumper';
import { RolloverSwitch } from './RolloverSwitch';
import { Slingshot } from './Slingshot';
import { Spinner } from './Spinner';
import { StandupTarget } from './StandupTarget';

const REGISTRY: Record<string, new (def: ModuleDef) => PlayfieldModule> = {
  PopBumper,
  Slingshot,
  DropTargetBank,
  StandupTarget,
  BumperPost,
  LaneDivider,
  Spinner,
  RolloverSwitch,
  KickoutHole,
  Gate,
  LightInsert,
  ArcadeDecal,
};

/** Module types the editor palette can offer. */
export const MODULE_TYPES = Object.keys(REGISTRY);

export function createModule(def: ModuleDef): PlayfieldModule {
  const Ctor = REGISTRY[def.type];
  if (!Ctor) throw new Error(`unknown module type "${def.type}"`);
  return new Ctor(def);
}
