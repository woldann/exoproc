/**
 * Exoproc Accessor Registry
 *
 * Manages active typed memory accessors mapped from target JVM game processes.
 * When attached to a process, Exoproc initializes these accessors to provide
 * direct AST/JNI memory pointer reads, field offsets, and live telemetry to the Web UI.
 */

export interface AccessorFieldDescriptor {
  name: string;
  type: 'double' | 'float' | 'int' | 'boolean' | 'pointer' | 'string';
  offset: string;
  description: string;
  value?: any;
}

export interface ActiveAccessor {
  id: string;
  name: string;
  className: string;
  jvmSignature: string;
  basePointer: string;
  status: 'resolved' | 'unresolved' | 'hooked';
  description: string;
  fields: AccessorFieldDescriptor[];
}

export class AccessorRegistry {
  private accessors: Map<string, ActiveAccessor> = new Map();
  public attachedPid: number | null = null;

  constructor() {
    this.registerDefaultAccessors();
  }

  private registerDefaultAccessors() {
    const defaultList: ActiveAccessor[] = [
      {
        id: 'player_sp',
        name: 'Local Player (EntityPlayerSP)',
        className: 'net.minecraft.client.entity.EntityPlayerSP',
        jvmSignature: 'Lave; -> Lbew;',
        basePointer: '0x00000000',
        status: 'unresolved',
        description:
          'Direct memory pointer to client local player coordinates, momentum vectors, and health',
        fields: [
          {
            name: 'posX',
            type: 'double',
            offset: '0x20',
            description: 'X Axis Coordinate',
            value: 0,
          },
          {
            name: 'posY',
            type: 'double',
            offset: '0x28',
            description: 'Y Axis Coordinate (Feet)',
            value: 0,
          },
          {
            name: 'posZ',
            type: 'double',
            offset: '0x30',
            description: 'Z Axis Coordinate',
            value: 0,
          },
          {
            name: 'motionX',
            type: 'double',
            offset: '0x40',
            description: 'X Momentum Vector',
            value: 0,
          },
          {
            name: 'motionY',
            type: 'double',
            offset: '0x48',
            description: 'Y Momentum (Gravity/Jump)',
            value: 0,
          },
          {
            name: 'motionZ',
            type: 'double',
            offset: '0x50',
            description: 'Z Momentum Vector',
            value: 0,
          },
          {
            name: 'rotationYaw',
            type: 'float',
            offset: '0x58',
            description: 'Horizontal Camera Angle',
            value: 0,
          },
          {
            name: 'rotationPitch',
            type: 'float',
            offset: '0x5C',
            description: 'Vertical Camera Angle',
            value: 0,
          },
          {
            name: 'health',
            type: 'float',
            offset: '0x110',
            description: 'Entity Health Points',
            value: 20,
          },
          {
            name: 'onGround',
            type: 'boolean',
            offset: '0x78',
            description: 'Ground Collision Flag',
            value: true,
          },
          {
            name: 'isSprinting',
            type: 'boolean',
            offset: '0x80',
            description: 'Sprint State Flag',
            value: false,
          },
        ],
      },
      {
        id: 'timer',
        name: 'Game Loop Timer',
        className: 'net.minecraft.util.Timer',
        jvmSignature: 'Lavl;',
        basePointer: '0x00000000',
        status: 'unresolved',
        description:
          'Game tick regulator and partial frame interpolation timer',
        fields: [
          {
            name: 'timerSpeed',
            type: 'float',
            offset: '0x18',
            description: 'Tick Rate Multiplier (Default 1.0)',
            value: 1.0,
          },
          {
            name: 'elapsedTicks',
            type: 'int',
            offset: '0x20',
            description: 'Ticks since last frame',
            value: 0,
          },
          {
            name: 'renderPartialTicks',
            type: 'float',
            offset: '0x24',
            description: 'Sub-tick rendering fraction',
            value: 0,
          },
        ],
      },
      {
        id: 'world_client',
        name: 'World Client (WorldClient)',
        className: 'net.minecraft.client.multiplayer.WorldClient',
        jvmSignature: 'Lbdb;',
        basePointer: '0x00000000',
        status: 'unresolved',
        description:
          'World entity storage, block collision bounds, and chunk providers',
        fields: [
          {
            name: 'loadedEntityList',
            type: 'pointer',
            offset: '0x60',
            description: 'JVM ArrayList of active entities in render distance',
            value: '0x00000000',
          },
          {
            name: 'playerEntities',
            type: 'pointer',
            offset: '0x68',
            description: 'List of other players in game world',
            value: '0x00000000',
          },
        ],
      },
      {
        id: 'game_settings',
        name: 'Game Settings & KeyBindings',
        className: 'net.minecraft.client.settings.GameSettings',
        jvmSignature: 'Lavh;',
        basePointer: '0x00000000',
        status: 'unresolved',
        description:
          'Keyboard, mouse, sensitivity, and keybind press state buffers',
        fields: [
          {
            name: 'keyBindAttack',
            type: 'pointer',
            offset: '0x38',
            description: 'Left click attack keybind state',
            value: '0x00000000',
          },
          {
            name: 'keyBindUseItem',
            type: 'pointer',
            offset: '0x40',
            description: 'Right click use item keybind state',
            value: '0x00000000',
          },
          {
            name: 'mouseSensitivity',
            type: 'float',
            offset: '0x48',
            description: 'Raw mouse sensitivity scalar',
            value: 0.5,
          },
        ],
      },
      {
        id: 'net_handler',
        name: 'Network Handler (NetHandlerPlayClient)',
        className: 'net.minecraft.client.network.NetHandlerPlayClient',
        jvmSignature: 'Lbcy;',
        basePointer: '0x00000000',
        status: 'unresolved',
        description:
          'Outbound and inbound packet pipeline for velocity and position sync',
        fields: [
          {
            name: 'networkManager',
            type: 'pointer',
            offset: '0x18',
            description: 'Channel pipeline Netty manager',
            value: '0x00000000',
          },
          {
            name: 'playerInfoMap',
            type: 'pointer',
            offset: '0x28',
            description: 'Tab list network player entries',
            value: '0x00000000',
          },
        ],
      },
    ];

    for (const acc of defaultList) {
      this.accessors.set(acc.id, acc);
    }
  }

  /**
   * Called when Exoproc attaches to a target process (PID).
   * Resolves base memory pointers for all accessors.
   */
  public attach(pid: number, _profileId = 'vanilla_1_8_9') {
    this.attachedPid = pid;

    // Generate resolved JVM heap pointer simulation
    const baseAddr = 0x7f800000 + pid * 0x1000;

    let idx = 0;
    for (const [id, acc] of this.accessors.entries()) {
      const resolvedPtr =
        '0x' + (baseAddr + idx * 0x20000).toString(16).toUpperCase();
      acc.basePointer = resolvedPtr;
      acc.status = 'resolved';

      // Initialize field dummy values based on realistic telemetry
      if (id === 'player_sp') {
        acc.fields.find((f) => f.name === 'posX')!.value = 100.5;
        acc.fields.find((f) => f.name === 'posY')!.value = 64.0;
        acc.fields.find((f) => f.name === 'posZ')!.value = -250.2;
        acc.fields.find((f) => f.name === 'health')!.value = 20.0;
      }
      idx++;
    }
  }

  public detach() {
    this.attachedPid = null;
    for (const acc of this.accessors.values()) {
      acc.status = 'unresolved';
      acc.basePointer = '0x00000000';
    }
  }

  public getAccessors(): ActiveAccessor[] {
    return Array.from(this.accessors.values());
  }

  public getAccessor(id: string): ActiveAccessor | undefined {
    return this.accessors.get(id);
  }

  public updateField(
    accessorId: string,
    fieldName: string,
    value: any,
  ): boolean {
    const acc = this.accessors.get(accessorId);
    if (!acc) return false;
    const field = acc.fields.find((f) => f.name === fieldName);
    if (!field) return false;
    field.value = value;
    return true;
  }
}
