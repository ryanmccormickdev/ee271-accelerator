`include "defines.sv"

module top(

    // Clock and Reset Inputs
    input wire clk,
    input wire rst_n,

    // Controls How Many Instructions Will be Executed
    input logic [`IMEM_ADDR_WIDTH-1:0] instruction_count
);

    // Top Level Signals
    instruction_t inst;
    wire          inst_valid;
    wire          inst_exec_begins;

    instruction_memory u_instruction_memory (
        .clk(clk),
        .rst_n(rst_n),
        .inst(inst),
        .inst_valid(inst_valid),
        .advance_pointer(inst_exec_begins),
        .instruction_count(instruction_count)
    );

    // START IMPLEMENTATION
    //
    // top has no logic of its own. It only declares the wires between the blocks and places them:
    //   instruction memory -> controller -> buffer (buf_inst) and every PE (pe_inst)
    //   buffer -> PEs: matrix_data (a different 32-bit slice per PE) and vector_data (the same for all)
    //   PEs -> buffer: output_data (each PE's result in its own slice), stored in MEM2 on a WRITE
    // The staff testbenches look inside top by name, so keep the names
    // pe_inst_valid, buf_inst_valid and u_buffer.

    // Controller -> buffer and PEs
    pe_inst_t  pe_inst;
    logic      pe_inst_valid;
    buf_inst_t buf_inst;
    logic      buf_inst_valid;

    // Buffer <-> PEs
    logic [`MEM0_BITWIDTH-1:0] matrix_data;     // `PE_COUNT x 32 bits; PE 0 gets the top (leftmost) 32
    logic [`MEM1_BITWIDTH-1:0] vector_data;     // one vector element, the same for every PE
    logic [`MEM2_BITWIDTH-1:0] output_data;     // `PE_COUNT x 32 bits, same order as matrix_data

    controller u_controller (
        .clk(clk),
        .rst_n(rst_n),
        .inst(inst),
        .inst_valid(inst_valid),
        .inst_exec_begins(inst_exec_begins),
        .pe_inst(pe_inst),
        .pe_inst_valid(pe_inst_valid),
        .buf_inst(buf_inst),
        .buf_inst_valid(buf_inst_valid)
    );

    buffer u_buffer (
        .clk(clk),
        .rst_n(rst_n),
        .buf_inst(buf_inst),
        .buf_inst_valid(buf_inst_valid),
        .matrix_data(matrix_data),
        .vector_data(vector_data),
        .output_data(output_data)
    );

    // `PE_COUNT copies of the PE. All get the same instruction and the same vector element.
    // Copy i reads the i-th 32-bit slice of matrix_data, counting from the left, and writes its result
    // into the same slice of output_data. x[start +: 32] means "32 bits from bit start upward".
    genvar i;
    generate
        for (i = 0; i < `PE_COUNT; i++) begin : g_pe
            processing_element u_pe (
                .clk(clk),
                .rst_n(rst_n),
                .pe_inst(pe_inst),
                .pe_inst_valid(pe_inst_valid),
                .vector_input(vector_data),
                .matrix_input(matrix_data[`PE_INPUT_BITWIDTH*(`PE_COUNT-1-i) +: `PE_INPUT_BITWIDTH]),
                .vector_output(output_data[`PE_OUTPUT_BITWIDTH*(`PE_COUNT-1-i) +: `PE_OUTPUT_BITWIDTH])
            );
        end
    endgenerate

    // END IMPLEMENTATION


endmodule
