/*
 * All rights reserved - Stanford University. 
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the "License"); 
 * you may not use this file except in compliance with the License.  
 * You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

#ifndef __INSTRUCTION_SPEC__
#define __INSTRUCTION_SPEC__

#include <nvhls_int.h>
#include <nvhls_types.h>
#include <cmath>
#include <nvhls_connections.h>
#include "systemc.h" // Move systemc.h here, if it is still needed. Let's try without it first. If error persists, move it here.

using namespace nvhls;

// This file defines the instruction set architecture (ISA) of the accelerator.
// It is a C++ translation of the Python reference implementation in cmod/SIMD/src/instruction.py.
// The main components are:
// - Mode: Defines the data types (INT8, INT16, INT32) for operations.
// - MemoryInstruction: Defines instructions for memory operations (READ, WRITE, NOP).
// - ProcessingElementInstruction: Defines instructions for the processing elements (MAC, NOP, OUT, etc.).
// - Instruction: The top-level instruction format that combines memory and PE instructions.

namespace spec {
  namespace Instruction {

    // From instruction.py: Mode
    struct Mode {
      enum {
        INT8 = 8,
        INT16 = 16,
        INT32 = 32,
        SMALLEST_MODE = 8
      };

      static int opcode(int value) {
        if (value == INT8) return 0;
        else if (value == INT16) return 1;
        else if (value == INT32) return 2;
        else return -1; 
      }

      static int bitwidth(int value) {
        return (1 << value) * 8;
      }
    };

    // From instruction.py: MemoryInstructionEnum
    struct MemoryInstructionEnum {
      enum Opcode {
        READ   = 0,
        WRITE  = 1,
        NOP    = 2
      };
    };
    typedef MemoryInstructionEnum MI;

    // From instruction.py: MemoryInstructionConfiguration
    struct MemoryInstructionConfiguration {
      enum {
        OPCODE_BITWIDTH      = 2,
        MODE_BITWIDTH        = 2,
        MEMA_OFFSET_BITWIDTH = 10, // Taken from controller_counter_bitwidth in compiler.py
        MEMB_OFFSET_BITWIDTH = 10  // Taken from controller_counter_bitwidth in compiler.py
      };
      static const int width = OPCODE_BITWIDTH + MODE_BITWIDTH + MEMA_OFFSET_BITWIDTH + MEMB_OFFSET_BITWIDTH;
    };

    // From instruction.py: ProcessingElementInstructionEnum
    struct ProcessingElementInstructionEnum {
      enum Opcode {
        NO_VALUE = 0,
        RND      = 1
      };
      enum SubOpcode {
        MAC      = 0,
        NOP      = 1,
        OUT      = 2,
        PASS     = 3,
        CLR      = 4
      };
    };
    typedef ProcessingElementInstructionEnum PEI;

    // From instruction.py: ProcessingElementInstructionConfiguration
    struct ProcessingElementInstructionConfiguration {
      enum {
        OPCODE_BITWIDTH      = 2,
        MODE_BITWIDTH        = 2,
        VALUE_BITWIDTH       = 5
      };
      static const int width = OPCODE_BITWIDTH + MODE_BITWIDTH + VALUE_BITWIDTH;
    };

    // From instruction.py: InstructionConfiguration
    struct InstructionConfiguration {
      enum {
        COUNT_BITWIDTH       = 10, // Taken from controller_counter_bitwidth in compiler.py
        MEMA_INC_BITWIDTH    = 1,
        MEMB_INC_BITWIDTH    = 1
      };
      static const int mem_inst_width = MemoryInstructionConfiguration::width;
      static const int pe_inst_width = ProcessingElementInstructionConfiguration::width;
      static const int width = COUNT_BITWIDTH + MEMA_INC_BITWIDTH + MEMB_INC_BITWIDTH + mem_inst_width + pe_inst_width;
    };

    // Helper structs for typed instructions
    template <typename Config>
    struct InstructionBase {
      typedef NVUINTW(Config::width) Packed_t;
      Packed_t packed;

      InstructionBase() : packed(0) {}
      InstructionBase(Packed_t val) : packed(val) {}

      static const int width = Config::width;

      bool operator==(const InstructionBase& other) const {
        return packed == other.packed;
      }
    };

    struct MemoryInstruction : public InstructionBase<MemoryInstructionConfiguration> {
        MemoryInstruction() : InstructionBase() {}
        MemoryInstruction(Packed_t val) : InstructionBase(val) {}

        static const int opcode_start = 0;
        static const int mode_start = opcode_start + MemoryInstructionConfiguration::OPCODE_BITWIDTH;
        static const int mema_offset_start = mode_start + MemoryInstructionConfiguration::MODE_BITWIDTH;
        static const int memb_offset_start = mema_offset_start + MemoryInstructionConfiguration::MEMA_OFFSET_BITWIDTH;

        NVUINTW(MemoryInstructionConfiguration::OPCODE_BITWIDTH) opcode() const { return nvhls::get_slc<MemoryInstructionConfiguration::OPCODE_BITWIDTH>(packed, opcode_start); }
        NVUINTW(MemoryInstructionConfiguration::MODE_BITWIDTH) mode() const { return nvhls::get_slc<MemoryInstructionConfiguration::MODE_BITWIDTH>(packed, mode_start); }
        NVUINTW(MemoryInstructionConfiguration::MEMA_OFFSET_BITWIDTH) mema_offset() const { return nvhls::get_slc<MemoryInstructionConfiguration::MEMA_OFFSET_BITWIDTH>(packed, mema_offset_start); }
        NVUINTW(MemoryInstructionConfiguration::MEMB_OFFSET_BITWIDTH) memb_offset() const { return nvhls::get_slc<MemoryInstructionConfiguration::MEMB_OFFSET_BITWIDTH>(packed, memb_offset_start); }

        void set_opcode(NVUINTW(MemoryInstructionConfiguration::OPCODE_BITWIDTH) val) { packed.set_slc(opcode_start, val); }
        void set_mode(NVUINTW(MemoryInstructionConfiguration::MODE_BITWIDTH) val) { packed.set_slc(mode_start, val); }
        void set_mema_offset(NVUINTW(MemoryInstructionConfiguration::MEMA_OFFSET_BITWIDTH) val) { packed.set_slc(mema_offset_start, val); }
        void set_memb_offset(NVUINTW(MemoryInstructionConfiguration::MEMB_OFFSET_BITWIDTH) val) { packed.set_slc(memb_offset_start, val); }
    };

    struct ProcessingElementInstruction : public InstructionBase<ProcessingElementInstructionConfiguration> {
        ProcessingElementInstruction() : InstructionBase() {}
        ProcessingElementInstruction(Packed_t val) : InstructionBase(val) {}

        static const int opcode_start = 0;
        static const int mode_start = opcode_start + ProcessingElementInstructionConfiguration::OPCODE_BITWIDTH;
        static const int value_start = mode_start + ProcessingElementInstructionConfiguration::MODE_BITWIDTH;

        NVUINTW(ProcessingElementInstructionConfiguration::OPCODE_BITWIDTH) opcode() const { return nvhls::get_slc<ProcessingElementInstructionConfiguration::OPCODE_BITWIDTH>(packed, opcode_start); }
        NVUINTW(ProcessingElementInstructionConfiguration::MODE_BITWIDTH) mode() const { return nvhls::get_slc<ProcessingElementInstructionConfiguration::MODE_BITWIDTH>(packed, mode_start); }
        NVUINTW(ProcessingElementInstructionConfiguration::VALUE_BITWIDTH) value() const { return nvhls::get_slc<ProcessingElementInstructionConfiguration::VALUE_BITWIDTH>(packed, value_start); }

        void set_opcode(NVUINTW(ProcessingElementInstructionConfiguration::OPCODE_BITWIDTH) val) { packed.set_slc(opcode_start, val); }
        void set_mode(NVUINTW(ProcessingElementInstructionConfiguration::MODE_BITWIDTH) val) { packed.set_slc(mode_start, val); }
        void set_value(NVUINTW(ProcessingElementInstructionConfiguration::VALUE_BITWIDTH) val) { packed.set_slc(value_start, val); }
    };

    struct Instruction : public InstructionBase<InstructionConfiguration> {
        Instruction() : InstructionBase() {}
        Instruction(Packed_t val) : InstructionBase(val) {}

        static const int mem_inst_start = 0;
        static const int pe_inst_start = mem_inst_start + InstructionConfiguration::mem_inst_width;
        static const int count_start = pe_inst_start + InstructionConfiguration::pe_inst_width;
        static const int mema_inc_start = count_start + InstructionConfiguration::COUNT_BITWIDTH;
        static const int memb_inc_start = mema_inc_start + InstructionConfiguration::MEMA_INC_BITWIDTH;

        MemoryInstruction mem_instruction() const { return MemoryInstruction(nvhls::get_slc<InstructionConfiguration::mem_inst_width>(packed, mem_inst_start)); }
        ProcessingElementInstruction pe_instruction() const { return ProcessingElementInstruction(nvhls::get_slc<InstructionConfiguration::pe_inst_width>(packed, pe_inst_start)); }
        NVUINTW(InstructionConfiguration::COUNT_BITWIDTH) count() const { return nvhls::get_slc<InstructionConfiguration::COUNT_BITWIDTH>(packed, count_start); }
        NVUINTW(InstructionConfiguration::MEMA_INC_BITWIDTH) mema_inc() const { return nvhls::get_slc<InstructionConfiguration::MEMA_INC_BITWIDTH>(packed, mema_inc_start); }
        NVUINTW(InstructionConfiguration::MEMB_INC_BITWIDTH) memb_inc() const { return nvhls::get_slc<InstructionConfiguration::MEMB_INC_BITWIDTH>(packed, memb_inc_start); }

        void set_mem_instruction(MemoryInstruction val) { packed.set_slc(mem_inst_start, val.packed); }
        void set_pe_instruction(ProcessingElementInstruction val) { packed.set_slc(pe_inst_start, val.packed); }
        void set_count(NVUINTW(InstructionConfiguration::COUNT_BITWIDTH) val) { packed.set_slc(count_start, val); }
        void set_mema_inc(NVUINTW(InstructionConfiguration::MEMA_INC_BITWIDTH) val) { packed.set_slc(mema_inc_start, val); }
        void set_memb_inc(NVUINTW(InstructionConfiguration::MEMB_INC_BITWIDTH) val) { packed.set_slc(memb_inc_start, val); }
    };
  }
}

#endif
