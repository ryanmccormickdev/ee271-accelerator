#include <systemc.h>
#include <mc_scverify.h>
#include <nvhls_connections.h>
#include <testbench/nvhls_rand.h>
#include <vector>
#include <deque>

#include "ProcessingElement.h"
#include "../InstructionSpec.h"
#include "../Spec.h"

#include <iostream>

#define NVHLS_VERIFY_BLOCKS (ProcessingElement)
#include <nvhls_verify.h>

//------------------------------------------------------------------------
// Source
//------------------------------------------------------------------------
SC_MODULE(Source)
{
  sc_in<bool> clk;
  sc_in<bool> rst;

  Connections::Out<spec::Instruction::ProcessingElementInstruction::Packed_t> pe_inst_out;
  Connections::Out<spec::VectorType> vector_input_out;
  Connections::Out<spec::VectorType> matrix_input_out;
  
  std::deque<spec::Instruction::ProcessingElementInstruction> instructions;
  std::deque<spec::VectorType> vector_inputs;
  std::deque<spec::VectorType> matrix_inputs;
  std::deque<bool> valid_send_instructions;

  SC_CTOR(Source) {
    SC_THREAD(run);
    sensitive << clk.pos();
    async_reset_signal_is(rst, false);
  }

  void run() {
    pe_inst_out.Reset();
    vector_input_out.Reset();
    matrix_input_out.Reset();

    wait(); 

    while (!instructions.empty()) {
      wait();
      pe_inst_out.Push(instructions.front().packed);
      instructions.pop_front();
      if (!valid_send_instructions.empty()) {
        if (valid_send_instructions.front()) {
          vector_input_out.Push(vector_inputs.front());
          vector_inputs.pop_front();
          matrix_input_out.Push(matrix_inputs.front());
          matrix_inputs.pop_front();
        }
      }
      valid_send_instructions.pop_front();
    }
  }
};


//------------------------------------------------------------------------
// Dest
//------------------------------------------------------------------------
SC_MODULE(Dest)
{
  sc_in<bool> clk;
  sc_in<bool> rst;
  Connections::In<spec::VectorType> vector_output_in;
  
  std::deque<spec::VectorType> expected_outputs;
  std::deque<std::string> test_names;

  SC_CTOR(Dest) {
    SC_THREAD(run);
    sensitive << clk.pos();
    async_reset_signal_is(rst, false);
  }

  void run() {
    vector_output_in.Reset();
    wait();

    while (1) {
      spec::VectorType val = vector_output_in.Pop();
      if (!expected_outputs.empty()) {
        spec::VectorType expected = expected_outputs.front();
        expected_outputs.pop_front();
        std::string test_name = "Unknown";
        if (!test_names.empty()) {
          test_name = test_names.front();
          test_names.pop_front();
        }

        if (val != expected) {
          SC_REPORT_ERROR("Dest", (test_name + " failed!").c_str());
          std::cout << "Expected: " << expected << ", Got: " << val << std::endl;
        } else {
          std::cout << "@" << sc_time_stamp() << " " << test_name << " passed." << std::endl;
        }
      }
    }
  }
};


//------------------------------------------------------------------------
// Testbench
//------------------------------------------------------------------------
SC_MODULE(testbench)
{
  SC_HAS_PROCESS(testbench);
  sc_clock clk;
  sc_signal<bool> rst;

  Connections::Combinational<spec::Instruction::ProcessingElementInstruction::Packed_t> pe_inst_chan;
  Connections::Combinational<spec::VectorType> vector_input_chan;
  Connections::Combinational<spec::VectorType> matrix_input_chan;
  Connections::Combinational<spec::VectorType> vector_output_chan;

  NVHLS_DESIGN(ProcessingElement) dut;
  Source source;
  Dest dest;

  testbench(sc_module_name name)
    : sc_module(name),
      clk("clk", 1.0, SC_NS, 0.5, 0, SC_NS, true),
      rst("rst"),
      dut("dut"),
      source("source"),
      dest("dest")
  {
    dut.clk(clk);
    dut.rst(rst);
    dut.pe_inst_in(pe_inst_chan);
    dut.vector_input(vector_input_chan);
    dut.matrix_input(matrix_input_chan);
    dut.vector_output(vector_output_chan);

    source.clk(clk);
    source.rst(rst);
    source.pe_inst_out(pe_inst_chan);
    source.vector_input_out(vector_input_chan);
    source.matrix_input_out(matrix_input_chan);

    dest.clk(clk);
    dest.rst(rst);
    dest.vector_output_in(vector_output_chan);

    testset();

    SC_THREAD(run);
  }
  
  void testset() {
    source.instructions.clear();
    source.vector_inputs.clear();
    source.matrix_inputs.clear();
    dest.expected_outputs.clear();
    dest.test_names.clear();
    
    auto create_pe_inst = [](
      spec::Instruction::ProcessingElementInstructionEnum::Opcode opcode,
      spec::Instruction::ProcessingElementInstructionEnum::SubOpcode sub_opcode,
      int mode_val) {
      spec::Instruction::ProcessingElementInstruction inst;
      inst.set_opcode(opcode);
      inst.set_value(sub_opcode);
      inst.set_mode(spec::Instruction::Mode::opcode(mode_val));
      return inst;
    };

    auto create_rnd_inst = [](unsigned int shift_amt, int mode_val) {
      spec::Instruction::ProcessingElementInstruction inst;
      inst.set_opcode(spec::Instruction::PEI::RND);
      inst.set_value(shift_amt);
      inst.set_mode(spec::Instruction::Mode::opcode(mode_val));
      return inst;
    };
    
    // --- Stream 1: MAC INT32, OUT INT32 ---
    source.instructions.push_back(create_pe_inst(spec::Instruction::PEI::NO_VALUE, spec::Instruction::PEI::CLR, spec::Instruction::Mode::INT32));
    source.valid_send_instructions.push_back(false);
    source.instructions.push_back(create_pe_inst(spec::Instruction::PEI::NO_VALUE, spec::Instruction::PEI::MAC, spec::Instruction::Mode::INT32));
    source.valid_send_instructions.push_back(true);
    source.vector_inputs.push_back(7);
    source.matrix_inputs.push_back(8);
    source.instructions.push_back(create_pe_inst(spec::Instruction::PEI::NO_VALUE, spec::Instruction::PEI::NOP, spec::Instruction::Mode::INT32));
    source.valid_send_instructions.push_back(false);
    source.instructions.push_back(create_pe_inst(spec::Instruction::PEI::NO_VALUE, spec::Instruction::PEI::OUT, spec::Instruction::Mode::INT32));
    source.valid_send_instructions.push_back(false);
    dest.expected_outputs.push_back(56);
    dest.test_names.push_back("Instruction Stream 1: CLR -> MAC -> NOP -> OUT, INT32");

    // --- Stream 2: PASS INT32, OUT INT32 ---
    source.instructions.push_back(create_pe_inst(spec::Instruction::PEI::NO_VALUE, spec::Instruction::PEI::CLR, spec::Instruction::Mode::INT32));
    source.valid_send_instructions.push_back(false);
    source.instructions.push_back(create_pe_inst(spec::Instruction::PEI::NO_VALUE, spec::Instruction::PEI::PASS, spec::Instruction::Mode::INT32));
    source.valid_send_instructions.push_back(true);
    source.vector_inputs.push_back(200);
    source.matrix_inputs.push_back(0);
    source.instructions.push_back(create_pe_inst(spec::Instruction::PEI::NO_VALUE, spec::Instruction::PEI::OUT, spec::Instruction::Mode::INT32));
    source.valid_send_instructions.push_back(false);
    dest.expected_outputs.push_back(200);
    dest.test_names.push_back("Instruction Stream 2: CLR -> PASS -> OUT, INT32");

    // --- Stream 3: PASS INT32, RND INT32, OUT INT32 ---
    source.instructions.push_back(create_pe_inst(spec::Instruction::PEI::NO_VALUE, spec::Instruction::PEI::CLR, spec::Instruction::Mode::INT32));
    source.valid_send_instructions.push_back(false);
    source.instructions.push_back(create_pe_inst(spec::Instruction::PEI::NO_VALUE, spec::Instruction::PEI::PASS, spec::Instruction::Mode::INT32));
    source.valid_send_instructions.push_back(true);
    source.vector_inputs.push_back(1000);
    source.matrix_inputs.push_back(0);
    source.instructions.push_back(create_rnd_inst(4, spec::Instruction::Mode::INT32));
    source.valid_send_instructions.push_back(false);
    source.instructions.push_back(create_pe_inst(spec::Instruction::PEI::NO_VALUE, spec::Instruction::PEI::OUT, spec::Instruction::Mode::INT32));
    source.valid_send_instructions.push_back(false);
    dest.expected_outputs.push_back(1000 >> 4);
    dest.test_names.push_back("Instruction Stream 3: CLR -> PASS -> RND -> OUT, INT32");
    
    // --- Stream 4: MAC INT16, OUT INT16 ---
    source.instructions.push_back(create_pe_inst(spec::Instruction::PEI::NO_VALUE, spec::Instruction::PEI::CLR, spec::Instruction::Mode::INT16));
    source.valid_send_instructions.push_back(false);
    source.instructions.push_back(create_pe_inst(spec::Instruction::PEI::NO_VALUE, spec::Instruction::PEI::MAC, spec::Instruction::Mode::INT16));
    source.valid_send_instructions.push_back(true);
    source.vector_inputs.push_back(0x00030002); // vec_in lanes: 3, 2
    source.matrix_inputs.push_back(0x00050004); // mat_in lanes: 5, 4
    source.instructions.push_back(create_pe_inst(spec::Instruction::PEI::NO_VALUE, spec::Instruction::PEI::OUT, spec::Instruction::Mode::INT16));
    source.valid_send_instructions.push_back(false);
    dest.expected_outputs.push_back(0x000F0008); // expected lanes: 15, 8
    dest.test_names.push_back("Instruction Stream 4: CLR -> MAC -> OUT, INT16");

    // --- Stream 5: MAC INT8, OUT INT8 ---
    source.instructions.push_back(create_pe_inst(spec::Instruction::PEI::NO_VALUE, spec::Instruction::PEI::CLR, spec::Instruction::Mode::INT8));
    source.valid_send_instructions.push_back(false);
    source.instructions.push_back(create_pe_inst(spec::Instruction::PEI::NO_VALUE, spec::Instruction::PEI::MAC, spec::Instruction::Mode::INT8));
    source.valid_send_instructions.push_back(true);
    source.vector_inputs.push_back(0x04030201); // vec_in lanes: 4, 3, 2, 1
    source.matrix_inputs.push_back(0x08070605); // mat_in lanes: 8, 7, 6, 5
    source.instructions.push_back(create_pe_inst(spec::Instruction::PEI::NO_VALUE, spec::Instruction::PEI::OUT, spec::Instruction::Mode::INT8));
    source.valid_send_instructions.push_back(false);
    dest.expected_outputs.push_back(0x20150C05); // expected lanes: 32, 21, 12, 5
    dest.test_names.push_back("Instruction Stream 5: CLR -> MAC -> OUT, INT8");
  }

  void run()
  {
    wait(2, SC_NS);
    std::cout << "@" << sc_time_stamp() << " Asserting reset" << std::endl;
    rst.write(false);
    wait(2, SC_NS);
    rst.write(true);
    std::cout << "@" << sc_time_stamp() << " De-Asserting reset" << std::endl;

    wait(100, SC_NS);
    
    std::cout << "@" << sc_time_stamp() << " sc_stop" << std::endl;
    sc_stop();
  }
};

int sc_main(int argc, char *argv[])
{
  nvhls::set_random_seed();
  testbench tb("tb");
  sc_report_handler::set_actions(SC_ERROR, SC_DISPLAY);
  sc_start();
  bool rc = (sc_report_handler::get_count(SC_ERROR) > 0);
  if (rc)
    DCOUT("TESTBENCH FAIL" << endl);
  else
    DCOUT("TESTBENCH PASS" << endl);
  return rc;
}
