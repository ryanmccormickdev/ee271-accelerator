#ifndef __PROCESSING_ELEMENT_H__
#define __PROCESSING_ELEMENT_H__

#pragma once

#include <systemc.h>
#include <nvhls_connections.h>
#include <nvhls_int.h>
#include "../Spec.h"
#include "../InstructionSpec.h"

using namespace nvhls;

SC_MODULE(ProcessingElement)
{
    sc_in<bool> clk;
    sc_in<bool> rst;

    Connections::In<spec::Instruction::ProcessingElementInstruction::Packed_t> pe_inst_in;
    Connections::In<spec::VectorType> vector_input;
    Connections::In<spec::VectorType> matrix_input;
    Connections::Out<spec::VectorType> vector_output;

    spec::AccumVectorType accumulation_register;


    SC_HAS_PROCESS(ProcessingElement);
    ProcessingElement(sc_module_name name)
        : sc_module(name),
          clk("clk"),
          rst("rst"),
          pe_inst_in("pe_inst_in"),
          vector_input("vector_input"),
          matrix_input("matrix_input"),
          vector_output("vector_output")

    {
        SC_THREAD(run);
        sensitive << clk.pos();
        async_reset_signal_is(rst, false);
    }

    void run()
    {
        pe_inst_in.Reset();
        vector_input.Reset();
        matrix_input.Reset();
        vector_output.Reset();

        accumulation_register = 0;

        wait();

        while (1) {
            wait();


            //////////////// START IMPLEMENTATION HERE ////////////////
            // TODO: Your code here 
            // Note:
            // 1. You can use spec::NVINTW(width) to define integer with arbitrary bit-width
            // 2. You can use nvhls::get_slc<width>(var, pos) to get a slice of 'width' bits from 'var' starting at 'pos' bit
            // 3. You can use var.set_slc(pos, value) to set a slice of 'var' starting at 'pos' bit with 'value'
            // 4. Becareful about the Blocking and non blocking behvaiour for all the inputs
            // 5. The martix_input and vector_input are only valid (or Poped from connections channel) for MAC and PASS instructions
            // 6. The vector_output is only valid (or Pushed to connections channel) for OUT instruction
            // 7. Refer to InstructionSpec.h for instruction format and opcode/value definitions
            // 8. work through opcodes for MAC, PASS, OUT, and NOP as defined in spec::Instruction::PEI
            

            //////////////// END IMPLEMENTATION HERE ////////////////
        }
    }
};
#endif // ___PROCESSING_ELEMENT_H__