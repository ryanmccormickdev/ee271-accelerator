from bitstring import Bits
from .instruction import ProcessingElementInstruction, PEI
from dataclasses import dataclass

@dataclass
class ProcessingElementConfiguration:
    INPUT_BITWIDTH        : int
    ACCUMULATION_BITWIDTH : int
    OUTPUT_BITWIDTH       : int

class ProcessingElement:

    def __init__(
        self,
        config : ProcessingElementConfiguration,
        default_value = 0
    ):

        # Saving Inputs
        self._config = config

        # Creating Bitstrings
        self._input_a_value = Bits(int=default_value, length=self._config.INPUT_BITWIDTH)
        self._input_b_value = Bits(int=default_value, length=self._config.INPUT_BITWIDTH)
        self._acc_value     = Bits(int=default_value, length=self._config.ACCUMULATION_BITWIDTH)
        self._output_value  = Bits(int=default_value, length=self._config.OUTPUT_BITWIDTH)

    def input_a(self, value : Bits) -> None:
        self._input_a_value = value

    def input_b(self, value : Bits) -> None:
        self._input_b_value = value

    # Handling Each Instruction
    def execute_instruction(self, instruction : ProcessingElementInstruction) -> None:
        # START IMPLEMENTATION
        opc = instruction.get_opcode().uint
        if opc == PEI.NO_VALUE: # Not RND, value field is instruction
            val = instruction.get_value().uint
            if val == PEI.MAC:
                self._handle_mac(instruction)
            elif val == PEI.OUT:
                self._handle_out(instruction)
            elif val == PEI.PASS:
                self._handle_pass(instruction)
            elif val == PEI.CLR:
                self._handle_clr(instruction)
            else:
                pass # NOP
        else: # RND, value field is s
            self._handle_rnd(instruction)
        # END IMPLEMENTATION
        return None

    def _handle_mac(self, instruction : ProcessingElementInstruction):
        # START IMPLEMENTATION
        w = instruction.get_mode_bitwidth()
        num_lanes = self._config.INPUT_BITWIDTH // w
        acc_lane_w = self._config.ACCUMULATION_BITWIDTH // num_lanes
        a_full = list(self._input_a_value.cut(w))
        b_full = list(self._input_b_value.cut(w))
        acc_full = list(self._acc_value.cut(acc_lane_w))
        
        new_acc_full = []
        for i in range(num_lanes):
            a = a_full[i].int
            b = b_full[i].int
            acc = acc_full[i].int
            new_acc = (acc + a*b) % (1 << acc_lane_w) # Intermediate products can overflow the specified width otherwise.
            new_acc_full.append(Bits(uint=new_acc, length=acc_lane_w))
            
        self._acc_value = Bits().join(new_acc_full)
        # END IMPLEMENTATION
        return None

    def _handle_out(self, instruction : ProcessingElementInstruction):
        # Clamp each signed wide lane to its signed output range; preserve accumulation.
        # START IMPLEMENTATION
        
        w = instruction.get_mode_bitwidth()
        num_lanes = self._config.INPUT_BITWIDTH // w
        acc_lane_w = self._config.ACCUMULATION_BITWIDTH // num_lanes
        out_lane_w = self._config.OUTPUT_BITWIDTH // num_lanes
        acc_full = list(self._acc_value.cut(acc_lane_w))
        
        low = -(1 << (out_lane_w - 1)) # Negative clamp
        high = (1 << (out_lane_w - 1)) - 1 # Positive clamp
        
        new_out_full = []
        for i in range(num_lanes):
            acc = acc_full[i].int
            val = min(max(acc, low), high)
            new_out_full.append(Bits(int=val, length=out_lane_w))
            
        self._output_value = Bits().join(new_out_full)
        # END IMPLEMENTATION
        return None

    def _handle_pass(self, instruction : ProcessingElementInstruction):
        # START IMPLEMENTATION
        w = instruction.get_mode_bitwidth()
        num_lanes = self._config.INPUT_BITWIDTH // w
        acc_lane_w = self._config.ACCUMULATION_BITWIDTH // num_lanes
        a_full = list(self._input_a_value.cut(w))
        
        new_acc_full = []
        for i in range(num_lanes):
            a = a_full[i].int
            new_acc_full.append(Bits(int=a, length=acc_lane_w))
            
        self._acc_value = Bits().join(new_acc_full)
        # END IMPLEMENTATION
        return None

    def _handle_clr(self, instruction : ProcessingElementInstruction):
        # START IMPLEMENTATION
        self._acc_value = Bits(int=0, length=self._config.ACCUMULATION_BITWIDTH)
        self._output_value = Bits(int=0, length=self._config.OUTPUT_BITWIDTH)
        # END IMPLEMENTATION
        return None

    def _handle_rnd(self, instruction : ProcessingElementInstruction):
        # Divide signed wide lanes by 2**unsigned(value), nearest with ties to even; preserve output.
        # START IMPLEMENTATION                
        w = instruction.get_mode_bitwidth()
        num_lanes = self._config.INPUT_BITWIDTH // w
        acc_lane_w = self._config.ACCUMULATION_BITWIDTH // num_lanes
        acc_full = list(self._acc_value.cut(acc_lane_w))
        s = instruction.get_value().uint
        
        new_acc_full = []
        for i in range(num_lanes):
            acc = acc_full[i].int
            
            # Rounding via the very specific ruleset
            if s != 0:
                halfway = 1 << (s-1) # The halfway of the remainder range (0 to 2^s-1)
                q = acc >> s
                r = acc - (q << s)
                if r > halfway:
                    acc = q+1
                elif r < halfway:
                    acc = q
                else:
                    if (q % 2 == 0):
                        acc = q
                    else:
                        acc = q+1
            
            new_acc_full.append(Bits(int=acc, length=acc_lane_w))
            
        self._acc_value = Bits().join(new_acc_full)
        
        # END IMPLEMENTATION
        return None

    def get_output(self) -> Bits:
        return self._output_value

    def get_accumulation(self) -> Bits:
        return self._acc_value
