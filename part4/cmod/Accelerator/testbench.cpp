#include <systemc.h>
#include <mc_scverify.h>
#include <nvhls_connections.h>
#include <testbench/nvhls_rand.h>
#include <vector>
#include <deque>

#include "Accelerator.h"
#include "Spec.h"
#include "InstructionSpec.h"
#include "numeric_cases.h"

#include <iostream>
#include <iomanip>

#define NVHLS_VERIFY_BLOCKS (Accelerator)
#include <nvhls_verify.h>

// ---------------- Source ----------------
SC_MODULE(Source)
{
  sc_in<bool> clk;
  sc_in<bool> rst;
  Connections::Out<spec::Instruction::Instruction::Packed_t> inst_out;
  Connections::Out<spec::VectorType> matrix_mem_write_out;
  Connections::Out<NVUINTW(spec::kMemAddrWidth)> matrix_mem_write_addr_out;
  Connections::Out<spec::VectorType> vector_mem_write_out;
  Connections::Out<NVUINTW(spec::kMemAddrWidth)> vector_mem_write_addr_out;
  Connections::Out<NVUINTW(spec::kMemAddrWidth)> output_mem_read_addr_out;
  Connections::In<spec::VectorType> output_mem_read_in;

  bool completed = false;
  std::deque<spec::Instruction::Instruction> instructions_to_send;
  
  SC_CTOR(Source)
  {
    SC_THREAD(run);
    sensitive << clk.pos();
    async_reset_signal_is(rst, false);
  }


  // These programs are checked through final output memory, independent of latency.
  void run_numeric_cases() {
    for (unsigned mode = 0; mode < 3; ++mode) {
      numeric_cases::Case test = numeric_cases::get(mode);
      std::cout << "Numeric mode " << mode << " loading and executing" << std::endl;
      for (unsigned i = 0; i < test.matrix.size(); ++i) {
        matrix_mem_write_addr_out.Push(i);
        matrix_mem_write_out.Push(test.matrix[i]);
      }
      for (unsigned i = 0; i < test.vector.size(); ++i) {
        vector_mem_write_addr_out.Push(i);
        vector_mem_write_out.Push(test.vector[i]);
      }
      for (unsigned i = 0; i < test.instructions.size(); ++i)
        inst_out.Push(spec::Instruction::Instruction::Packed_t(test.instructions[i]));
      for (unsigned i = 0; i < test.expected.size(); ++i) {
        output_mem_read_addr_out.Push(i);
        spec::VectorType actual = output_mem_read_in.Pop();
        if (actual != spec::VectorType(test.expected[i])) {
          std::cout << "Numeric mode " << mode << " output " << i
                    << " expected " << test.expected[i] << " got " << actual << std::endl;
          SC_REPORT_ERROR("numeric cases", "Final output memory mismatch");
        }
      }
      std::cout << "Numeric final-memory cases completed for mode " << mode << std::endl;
    }
  }

  void run()
  {
    completed = false;
    inst_out.Reset();
    matrix_mem_write_out.Reset();
    matrix_mem_write_addr_out.Reset();
    vector_mem_write_out.Reset();
    vector_mem_write_addr_out.Reset();
    output_mem_read_addr_out.Reset();
    output_mem_read_in.Reset();

    wait(); // wait for reset release
    for (int k=0; k<3; k++) {
      for (int j=0; j < 6; j++){
        int mat_idx = k * spec::N_PE * 6 + j * spec::N_PE;
        int vec_idx = k * 6 + j;
        if (k == 0) {
          // --- INT32 Test Data ---
          for (int i=0; i<spec::N_PE; ++i) {
            matrix_mem_write_addr_out.Push(mat_idx + i);
            matrix_mem_write_out.Push(5);
            wait(1, SC_NS);
          }
          vector_mem_write_addr_out.Push(vec_idx);
          vector_mem_write_out.Push(10);
          wait(1, SC_NS);
        }
        if (k == 1) {
          // --- INT16 Test Data ---
          for (int i=0; i<spec::N_PE; ++i) {
            matrix_mem_write_addr_out.Push(mat_idx + i);
            matrix_mem_write_out.Push(0x00050004);
            wait(1, SC_NS);
          }
          vector_mem_write_addr_out.Push(vec_idx);
          vector_mem_write_out.Push(0x00030002);
          wait(1, SC_NS);
        }
        if (k == 2) {
          // --- INT8 Test Data ---
          for (int i=0; i<spec::N_PE; ++i) {
            matrix_mem_write_addr_out.Push(mat_idx + i);
            matrix_mem_write_out.Push(0x01010101);
            wait(1, SC_NS);
          }
          vector_mem_write_addr_out.Push(vec_idx);
          vector_mem_write_out.Push(0x04030201);
          wait(1, SC_NS);
        }
      }
    }

    while (!instructions_to_send.empty()) {
      spec::Instruction::Instruction inst = instructions_to_send.front();
      instructions_to_send.pop_front();
      inst_out.Push(inst.packed);
      wait(2, SC_NS);
    }
    wait();

    // Check results in output memory
    bool test_passed = true;
    for (int i=0; i<spec::N_PE; ++i) {
      output_mem_read_addr_out.Push(i);
      wait(1, SC_NS);
      spec::VectorType res = output_mem_read_in.Pop();
      spec::VectorType expected = 5 * 10 * 6;
      //std::cout << "Result in output_mem[" << i << "]: " << res.to_int() << " (expected: " << expected.to_int() << ")" << std::endl;
      if (res != expected) {
        test_passed = false;
      } 
    }
    if (test_passed)
      cout << "INT32 CLR -> MAC -> OUT test passed" << endl;
    else
      cout << "INT32 CLR -> MAC -> OUT test failed" << endl;

    for (int i=0; i<spec::N_PE; ++i) {
      output_mem_read_addr_out.Push(spec::N_PE + i);
      wait(1, SC_NS);
      spec::VectorType res = output_mem_read_in.Pop();
      spec::VectorType expected = 9830520;
      //std::cout << "Result in output_mem[" << i + spec::N_PE << "]: " << res.to_int() << " (expected: " << expected.to_int() << ")" << std::endl;
      if (res != expected) {
        test_passed = false;
      }
    }
    if (test_passed)
      cout << "INT16 CLR -> MAC -> OUT test passed" << endl;
    else
      cout << "INT16 CLR -> MAC -> OUT test failed" << endl;

    for (int i=0; i<spec::N_PE; ++i) {
      output_mem_read_addr_out.Push(2*spec::N_PE + i);
      wait(1, SC_NS);
      spec::VectorType res = output_mem_read_in.Pop();
      spec::VectorType expected = 336860180 ;
      //std::cout << "Result in output_mem[" << i + spec::N_PE << "]: " << res.to_int() << " (expected: " << expected.to_int() << ")" << std::endl;
      if (res != expected) {
        test_passed = false;
      }
    }
    if (test_passed)
      cout << "INT8 CLR -> MAC -> OUT test passed" << endl;
    else
      cout << "INT8 CLR -> MAC -> OUT test failed" << endl;

    
    if (!test_passed) {
      SC_REPORT_ERROR("testbench", "Incorrect result in output memory");
    } else {
      std::cout << "Test passed." << std::endl;
    }
    run_numeric_cases();
    completed = true;

  }
};


// ---------------- TB ----------------
SC_MODULE(testbench)
{
  SC_HAS_PROCESS(testbench);
  sc_clock clk;
  sc_signal<bool> rst;

  Connections::Combinational<spec::Instruction::Instruction::Packed_t> inst_in_chan;
  Connections::Combinational<spec::VectorType> matrix_mem_write_chan;
  Connections::Combinational<NVUINTW(spec::kMemAddrWidth)> matrix_mem_write_addr_chan;
  Connections::Combinational<spec::VectorType> vector_mem_write_chan;
  Connections::Combinational<NVUINTW(spec::kMemAddrWidth)> vector_mem_write_addr_chan;
  Connections::Combinational<spec::VectorType> output_mem_read_chan;
  Connections::Combinational<NVUINTW(spec::kMemAddrWidth)> output_mem_read_addr_chan;

  NVHLS_DESIGN(Accelerator) dut;
  Source source;

  testbench(sc_module_name name)
      : sc_module(name),
        clk("clk", 1.0, SC_NS, 0.5, 0, SC_NS, true),
        rst("rst"),
        dut("dut"),
        source("source")
  {

    // DUT binds
    dut.clk(clk);
    dut.rst(rst);
    dut.inst_in(inst_in_chan);
    dut.matrix_mem_write(matrix_mem_write_chan);
    dut.matrix_mem_write_addr(matrix_mem_write_addr_chan);
    dut.vector_mem_write(vector_mem_write_chan);
    dut.vector_mem_write_addr(vector_mem_write_addr_chan);
    dut.output_mem_read(output_mem_read_chan);
    dut.output_mem_read_addr(output_mem_read_addr_chan);


    // Source binds
    source.clk(clk);
    source.rst(rst);
    source.inst_out(inst_in_chan);
    source.matrix_mem_write_out(matrix_mem_write_chan);
    source.matrix_mem_write_addr_out(matrix_mem_write_addr_chan);
    source.vector_mem_write_out(vector_mem_write_chan);
    source.vector_mem_write_addr_out(vector_mem_write_addr_chan);
    source.output_mem_read_addr_out(output_mem_read_addr_chan);
    source.output_mem_read_in(output_mem_read_chan);

    testset();

    SC_THREAD(run);
  }

  void testset()
  {
    // Create and queue instructions for the Source module
    // --- CLR (INT32) ---
    spec::Instruction::Instruction clr_inst_32;
    spec::Instruction::MemoryInstruction nop_mem_inst_32;
    spec::Instruction::ProcessingElementInstruction clr_pe_inst_32;
    nop_mem_inst_32.set_opcode(spec::Instruction::MI::NOP);
    clr_pe_inst_32.set_opcode(spec::Instruction::PEI::NO_VALUE);
    clr_pe_inst_32.set_value(spec::Instruction::PEI::CLR);
    clr_pe_inst_32.set_mode(spec::Instruction::Mode::opcode(spec::Instruction::Mode::INT32));
    clr_inst_32.set_mem_instruction(nop_mem_inst_32);
    clr_inst_32.set_pe_instruction(clr_pe_inst_32);
    clr_inst_32.set_count(0);
    source.instructions_to_send.push_back(clr_inst_32);
    
    // 1. MAC instruction
    spec::Instruction::Instruction mac_inst;
    spec::Instruction::MemoryInstruction mac_mem_inst;
    spec::Instruction::ProcessingElementInstruction mac_pe_inst;

    mac_mem_inst.set_opcode(spec::Instruction::MI::READ);
    mac_mem_inst.set_mode(spec::Instruction::Mode::opcode(spec::Instruction::Mode::INT32));
    mac_mem_inst.set_mema_offset(0);
    mac_mem_inst.set_memb_offset(0);

    mac_pe_inst.set_opcode(spec::Instruction::PEI::NO_VALUE);
    mac_pe_inst.set_value(spec::Instruction::PEI::MAC);
    mac_pe_inst.set_mode(spec::Instruction::Mode::opcode(spec::Instruction::Mode::INT32));

    mac_inst.set_mem_instruction(mac_mem_inst);
    mac_inst.set_pe_instruction(mac_pe_inst);
    mac_inst.set_count(5); // Execute for 1 cycle
    mac_inst.set_mema_inc(1);
    mac_inst.set_memb_inc(1);

    source.instructions_to_send.push_back(mac_inst);

    // 2. OUT instruction
    spec::Instruction::Instruction out_inst;
    spec::Instruction::MemoryInstruction out_mem_inst;
    spec::Instruction::ProcessingElementInstruction out_pe_inst;

    out_mem_inst.set_opcode(spec::Instruction::MI::WRITE);
    out_mem_inst.set_mode(spec::Instruction::Mode::opcode(spec::Instruction::Mode::INT32));
    out_mem_inst.set_mema_offset(0);
    out_mem_inst.set_memb_offset(0);

    out_pe_inst.set_opcode(spec::Instruction::PEI::NO_VALUE);
    out_pe_inst.set_value(spec::Instruction::PEI::OUT);
    out_pe_inst.set_mode(spec::Instruction::Mode::opcode(spec::Instruction::Mode::INT32));

    out_inst.set_mem_instruction(out_mem_inst);
    out_inst.set_pe_instruction(out_pe_inst);
    out_inst.set_count(0); // Execute for 1 cycle
    out_inst.set_mema_inc(0);
    out_inst.set_memb_inc(0);
    
    source.instructions_to_send.push_back(out_inst);

    // --- CLR (INT32) ---
    nop_mem_inst_32.set_opcode(spec::Instruction::MI::NOP);
    clr_pe_inst_32.set_opcode(spec::Instruction::PEI::NO_VALUE);
    clr_pe_inst_32.set_value(spec::Instruction::PEI::CLR);
    clr_pe_inst_32.set_mode(spec::Instruction::Mode::opcode(spec::Instruction::Mode::INT16));
    clr_inst_32.set_mem_instruction(nop_mem_inst_32);
    clr_inst_32.set_pe_instruction(clr_pe_inst_32);
    clr_inst_32.set_count(0);
    source.instructions_to_send.push_back(clr_inst_32);

    // 1. MAC instruction
    mac_mem_inst.set_mode(spec::Instruction::Mode::opcode(spec::Instruction::Mode::INT16));
    mac_mem_inst.set_mema_offset(6);
    mac_mem_inst.set_memb_offset(6);
    mac_pe_inst.set_mode(spec::Instruction::Mode::opcode(spec::Instruction::Mode::INT16));
    mac_inst.set_mem_instruction(mac_mem_inst);
    mac_inst.set_pe_instruction(mac_pe_inst);
    mac_inst.set_count(5); // Execute for 1 cycle
    mac_inst.set_mema_inc(1);
    mac_inst.set_memb_inc(1);

    source.instructions_to_send.push_back(mac_inst);

    // 2. OUT instruction
    out_mem_inst.set_mode(spec::Instruction::Mode::opcode(spec::Instruction::Mode::INT16));
    out_mem_inst.set_mema_offset(1);
    out_mem_inst.set_memb_offset(1);
    out_pe_inst.set_mode(spec::Instruction::Mode::opcode(spec::Instruction::Mode::INT16));

    out_inst.set_mem_instruction(out_mem_inst);
    out_inst.set_pe_instruction(out_pe_inst);
    out_inst.set_count(0); // Execute for 1 cycle
    out_inst.set_mema_inc(0);
    out_inst.set_memb_inc(0);
    
    source.instructions_to_send.push_back(out_inst);

        // --- CLR (INT32) ---
    nop_mem_inst_32.set_opcode(spec::Instruction::MI::NOP);
    clr_pe_inst_32.set_opcode(spec::Instruction::PEI::NO_VALUE);
    clr_pe_inst_32.set_value(spec::Instruction::PEI::CLR);
    clr_pe_inst_32.set_mode(spec::Instruction::Mode::opcode(spec::Instruction::Mode::INT8));
    clr_inst_32.set_mem_instruction(nop_mem_inst_32);
    clr_inst_32.set_pe_instruction(clr_pe_inst_32);
    clr_inst_32.set_count(0);
    source.instructions_to_send.push_back(clr_inst_32);

    // 1. MAC instruction
    mac_mem_inst.set_mode(spec::Instruction::Mode::opcode(spec::Instruction::Mode::INT8));
    mac_mem_inst.set_mema_offset(12);
    mac_mem_inst.set_memb_offset(12);
    mac_pe_inst.set_mode(spec::Instruction::Mode::opcode(spec::Instruction::Mode::INT8));
    mac_inst.set_mem_instruction(mac_mem_inst);
    mac_inst.set_pe_instruction(mac_pe_inst);
    mac_inst.set_count(5); // Execute for 1 cycle
    mac_inst.set_mema_inc(1);
    mac_inst.set_memb_inc(1);

    source.instructions_to_send.push_back(mac_inst);

    // 2. OUT instruction
    out_mem_inst.set_mode(spec::Instruction::Mode::opcode(spec::Instruction::Mode::INT8));
    out_mem_inst.set_mema_offset(2);
    out_mem_inst.set_memb_offset(2);
    out_pe_inst.set_mode(spec::Instruction::Mode::opcode(spec::Instruction::Mode::INT8));

    out_inst.set_mem_instruction(out_mem_inst);
    out_inst.set_pe_instruction(out_pe_inst);
    out_inst.set_count(0); // Execute for 1 cycle
    out_inst.set_mema_inc(0);
    out_inst.set_memb_inc(0);
    
    source.instructions_to_send.push_back(out_inst);

  }

  void run()
  {
    wait(2, SC_NS);
    std::cout << "@" << sc_time_stamp() << " Asserting reset" << std::endl;
    rst.write(false);
    wait(2, SC_NS);
    rst.write(true);
    std::cout << "@" << sc_time_stamp() << " De-Asserting reset" << std::endl;
    
    wait(100000, SC_NS);

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

  if (!tb.source.completed) SC_REPORT_ERROR("testbench", "Timeout before final-memory validation completed");
  bool rc = (sc_report_handler::get_count(SC_ERROR) > 0);

  if (rc)
    DCOUT("TESTBENCH FAIL" << endl);
  else
    DCOUT("TESTBENCH PASS" << endl);
  return rc;
}
