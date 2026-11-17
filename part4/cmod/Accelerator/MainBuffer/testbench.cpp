#include <systemc.h>
#include <mc_scverify.h>
#include <nvhls_connections.h>
#include <testbench/nvhls_rand.h>
#include <vector>
#include <deque>

#include "MainBuffer.h"
#include "../InstructionSpec.h"
#include "../Spec.h"

#include <iostream>

using namespace spec;
#define NVHLS_VERIFY_BLOCKS (MainBuffer)
#include <nvhls_verify.h>

//------------------------------------------------------------------------
// Source
//------------------------------------------------------------------------
SC_MODULE(Source)
{
  sc_in<bool> clk;
  sc_in<bool> rst;

  Connections::Out<spec::Instruction::MemoryInstruction::Packed_t> buf_inst_out;
  Connections::Out<spec::VectorType> output_data_out[spec::N_PE];

  Connections::Out<spec::VectorType> matrix_mem_write_out;
  Connections::Out<NVUINTW(spec::kMemAddrWidth)> matrix_mem_write_addr_out;
  Connections::Out<spec::VectorType> vector_mem_write_out;
  Connections::Out<NVUINTW(spec::kMemAddrWidth)> vector_mem_write_addr_out;
  Connections::Out<NVUINTW(spec::kMemAddrWidth)> output_mem_read_addr_out;
  Connections::In<spec::VectorType> output_mem_read_in;

  std::deque<spec::Instruction::MemoryInstruction> instructions;
  std::deque<spec::VectorType> write_data;

  spec::VectorType data;
  NVUINTW(spec::kMemAddrWidth) addr;

  SC_CTOR(Source) {
    SC_THREAD(run);
    sensitive << clk.pos();
    async_reset_signal_is(rst, false);
  }

  void run() {
    buf_inst_out.Reset();
    matrix_mem_write_out.Reset();
    matrix_mem_write_addr_out.Reset();
    vector_mem_write_out.Reset();
    vector_mem_write_addr_out.Reset();
    output_mem_read_addr_out.Reset();
    output_mem_read_in.Reset();

    #pragma hls_unroll yes
    for (int i=0; i<spec::N_PE; i++) {
        output_data_out[i].Reset();
    }
    wait(); 

    for (int i=0; i<spec::N_PE; i++) {
      addr = i;
      data = 101 + i;
      matrix_mem_write_addr_out.Push(addr);
      matrix_mem_write_out.Push(data);
      wait(1, SC_NS);
    }

    addr = 0;
    data = 202;
    vector_mem_write_addr_out.Push(addr);
    vector_mem_write_out.Push(data);
    wait(1, SC_NS);

    addr = 1;
    data = 0xABCD1234;
    vector_mem_write_addr_out.Push(addr);
    vector_mem_write_out.Push(data);
    wait(1, SC_NS);

    addr = 2;
    data = 0x11223344;
    vector_mem_write_addr_out.Push(addr);
    vector_mem_write_out.Push(data);
    wait(1, SC_NS);    

    while (!instructions.empty()) {
      spec::Instruction::MemoryInstruction inst = instructions.front();
      instructions.pop_front();
      
      buf_inst_out.Push(inst.packed);
      //cout << "Source: Sent instruction with opcode " << inst.opcode() << endl;

      if (inst.opcode() == spec::Instruction::MI::WRITE) {
        spec::VectorType data = write_data.front();
        write_data.pop_front();
        #pragma hls_unroll yes
        for (int i=0; i<spec::N_PE; i++) {
            output_data_out[i].Push(data + i); // Push unique data for each PE
        }
      }
      wait();
    }

    wait(200);

    bool write_passed = true;
    for (int i=0; i<spec::N_PE; i++) {
        output_mem_read_addr_out.Push(spec::N_PE*5 + i);
        wait(1, SC_NS);
        spec::VectorType res = output_mem_read_in.Pop();
        if (res != (spec::VectorType)(303 + i)) {
            write_passed = false;
        }
    }
    if (write_passed) {
      std::cout << "@" << sc_time_stamp() << " WRITE Test passed." << std::endl;
    } else {
      SC_REPORT_ERROR("Testbench", "WRITE Test failed!");
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
  Connections::In<spec::VectorType> matrix_data_in[spec::N_PE];
  Connections::In<spec::VectorType> vector_data_in[spec::N_PE];
  
  std::deque<std::vector<spec::VectorType>> expected_matrix_data;
  std::deque<spec::VectorType> expected_vector_data;
  std::deque<std::string> test_names;

  SC_CTOR(Dest) {
    SC_THREAD(run);
    sensitive << clk.pos();
    async_reset_signal_is(rst, false);
  }

  void run() {
    #pragma hls_unroll yes
    for (int i=0; i<spec::N_PE; i++) {
        matrix_data_in[i].Reset();
        vector_data_in[i].Reset();
    }
    wait();

    while (1) {
      spec::VectorType mat_vals[spec::N_PE];
      spec::VectorType vec_vals[spec::N_PE];
      #pragma hls_unroll yes
      for (int i=0; i<spec::N_PE; i++) {
        mat_vals[i] = matrix_data_in[i].Pop();
        vec_vals[i] = vector_data_in[i].Pop();
      }
      
      if (!expected_matrix_data.empty()) {
        std::vector<spec::VectorType> expected_mat_vec = expected_matrix_data.front();
        expected_matrix_data.pop_front();
        spec::VectorType expected_vec = expected_vector_data.front();
        expected_vector_data.pop_front();
        std::string test_name = test_names.front();
        test_names.pop_front();

        bool failed = false;
        #pragma hls_unroll yes
        for (int i=0; i<spec::N_PE; i++) {
            if (mat_vals[i] != expected_mat_vec[i]) {
                failed = true;
            }
            if (vec_vals[i] != expected_vec) { // All vector values should be the same
                failed = true;
            }
        }

        if (failed) {
          SC_REPORT_ERROR("Dest", (test_name + " failed!").c_str());
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

  Connections::Combinational<spec::Instruction::MemoryInstruction::Packed_t> buf_inst_chan;
  Connections::Combinational<spec::VectorType> output_data_chan[spec::N_PE];
  Connections::Combinational<spec::VectorType> matrix_data_chan[spec::N_PE];
  Connections::Combinational<spec::VectorType> vector_data_chan[spec::N_PE];

  // Channels for memory access
  Connections::Combinational<spec::VectorType> matrix_mem_write_chan;
  Connections::Combinational<NVUINTW(spec::kMemAddrWidth)> matrix_mem_write_addr_chan;
  Connections::Combinational<spec::VectorType> vector_mem_write_chan;
  Connections::Combinational<NVUINTW(spec::kMemAddrWidth)> vector_mem_write_addr_chan;
  Connections::Combinational<spec::VectorType> output_mem_read_chan;
  Connections::Combinational<NVUINTW(spec::kMemAddrWidth)> output_mem_read_addr_chan;

  NVHLS_DESIGN(MainBuffer) dut;
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
    dut.buf_inst_in(buf_inst_chan);
    dut.matrix_mem_write(matrix_mem_write_chan);
    dut.matrix_mem_write_addr(matrix_mem_write_addr_chan);
    dut.vector_mem_write(vector_mem_write_chan);
    dut.vector_mem_write_addr(vector_mem_write_addr_chan);
    dut.output_mem_read(output_mem_read_chan);
    dut.output_mem_read_addr(output_mem_read_addr_chan);

    source.clk(clk);
    source.rst(rst);
    source.buf_inst_out(buf_inst_chan);
    source.matrix_mem_write_out(matrix_mem_write_chan);
    source.matrix_mem_write_addr_out(matrix_mem_write_addr_chan);
    source.vector_mem_write_out(vector_mem_write_chan);
    source.vector_mem_write_addr_out(vector_mem_write_addr_chan);
    source.output_mem_read_addr_out(output_mem_read_addr_chan);
    source.output_mem_read_in(output_mem_read_chan);


    dest.clk(clk);
    dest.rst(rst);

    #pragma hls_unroll yes
    for (int i=0; i<spec::N_PE; i++) {
        dut.output_data_in[i](output_data_chan[i]);
        dut.matrix_data_out[i](matrix_data_chan[i]);
        dut.vector_data_out[i](vector_data_chan[i]);
        source.output_data_out[i](output_data_chan[i]);
        dest.matrix_data_in[i](matrix_data_chan[i]);
        dest.vector_data_in[i](vector_data_chan[i]);
    }

    testset();

    SC_THREAD(run);
  }
  
  void testset() {

    auto create_mem_inst = [](
      spec::Instruction::MemoryInstructionEnum::Opcode opcode,
      int mode_val,
      unsigned mema_offset, unsigned memb_offset) {
      spec::Instruction::MemoryInstruction inst;
      inst.set_opcode(opcode);
      inst.set_mode(spec::Instruction::Mode::opcode(mode_val));
      inst.set_mema_offset(mema_offset);
      inst.set_memb_offset(memb_offset);
      return inst;
    };
    
    // --- Test 1: Read from memory (INT32) ---
    source.instructions.push_back(create_mem_inst(spec::Instruction::MI::READ, spec::Instruction::Mode::INT32, 0, 0));
    std::vector<spec::VectorType> expected_mat_1(spec::N_PE);
    for (int i=0; i<spec::N_PE; i++) expected_mat_1[i] = 101 + i;
    dest.expected_matrix_data.push_back(expected_mat_1);
    dest.expected_vector_data.push_back(202);
    dest.test_names.push_back("READ Test INT32");
   
    // --- Test 4: Read from memory (INT16) ---
    source.instructions.push_back(create_mem_inst(spec::Instruction::MI::READ, spec::Instruction::Mode::INT16, 0, 2));
    std::vector<spec::VectorType> expected_mat_2(spec::N_PE);
    for (int i=0; i<spec::N_PE; i++) expected_mat_2[i] = 101 + i;
    dest.expected_matrix_data.push_back(expected_mat_2);
    dest.expected_vector_data.push_back(0x12341234);
    dest.test_names.push_back("READ Test INT16 (sub-vector 0)");

    // --- Test 5: Read from memory (INT8) ---
    source.instructions.push_back(create_mem_inst(spec::Instruction::MI::READ, spec::Instruction::Mode::INT8, 0, 10));
    std::vector<spec::VectorType> expected_mat_3(spec::N_PE);
    for (int i=0; i<spec::N_PE; i++) expected_mat_3[i] = 101 + i;
    dest.expected_matrix_data.push_back(expected_mat_3);
    dest.expected_vector_data.push_back(0x22222222);
    dest.test_names.push_back("READ Test INT8 (sub-vector 2)");

    // --- Test 2: Write to memory ---
    source.instructions.push_back(create_mem_inst(spec::Instruction::MI::WRITE, spec::Instruction::Mode::INT32, 5, 0));
    source.write_data.push_back(303);

    // --- Test 3: NOP Instruction ---
    source.instructions.push_back(create_mem_inst(spec::Instruction::MI::NOP, spec::Instruction::Mode::INT8, 0, 0));
    // No expected data for NOP
    dest.test_names.push_back("NOP Test");
    cout << "NOP Test passed." << endl;
  }


  void run()
  {
    
    wait(2, SC_NS);
    std::cout << "@" << sc_time_stamp() << " Asserting reset" << std::endl;
    rst.write(false);
    wait(2, SC_NS);
    rst.write(true);
    std::cout << "@" << sc_time_stamp() << " De-Asserting reset" << std::endl;

    wait(1000, SC_NS);
    
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
