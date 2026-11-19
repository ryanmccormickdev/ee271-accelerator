`include "defines.sv"

module buffer (
    // Clock and Reset
    input wire clk,
    input wire rst_n,

    // Input Instruction
    input buf_inst_t    buf_inst,
    input logic         buf_inst_valid,

    // Outputs
    output logic [`MEM0_BITWIDTH-1:0] matrix_data,
    output logic [`MEM1_BITWIDTH-1:0] vector_data,
    input  logic [`MEM2_BITWIDTH-1:0] output_data
);

    // START IMPLEMENTATION
    assign vector_data = '0;
    logic [`BUF_MEMB_OFFSET_BITWIDTH-1:0] memb_q;
    logic [`BUF_MODE_BITWIDTH-1:0] mode_q;

    always_ff @(posedge clk, negedge rst_n) begin
        if (!rst_n) begin
            memb_q <= '0;
            mode_q <= '0;
        end else begin
            memb_q <= buf_inst.memb_offset;
            mode_q <= buf_inst.mode;
        end
    end
    
    array #(
        .DW(`MEM0_BITWIDTH),
        .NW(`MEM0_DEPTH),
        .AW(`MEM0_ADDR_WIDTH)
    ) u_matrix_mem (
        .clk(clk),
        .cen('0),
        .wen('1),
        .gwen('1),
        .a(buf_inst.mema_offset),
        .d(),
        .q(matrix_data)
    );

    logic [`MEM1_ADDR_WIDTH-1:0] addr;
    logic [`MEM1_BITWIDTH-1:0] data;

    vector_decoder u_addr_dec #(
        .data_from_mem(u_m),
        .addr_from_controller(u_addr_dec),
        .addr_from_controller_reg('0),s
        .mode('0),
        .data_to_pe('0),
        .addr_to_mem('0) 
    )

    vector_decoder u_data_dec #(
        .data_from_mem(u_data_dec),
        .addr_from_controller(u_addr_dec),
        .addr_from_controller_reg('0),
        .mode('0),
        .data_to_pe('0),
        .addr_to_mem('0) 
    )

    array #(
        .DW(`MEM1_BITWIDTH),
        .NW(`MEM1_DEPTH),
        .AW(`MEM1_ADDR_WIDTH)
    ) u_vector_mem (
        .clk(clk),
        .cen('0),
        .wen('1),
        .gwen('1),
        .a(),
        .d(),
        .q()
    );

    logic write_control_n;
    array #(
        .DW(`MEM2_BITWIDTH),
        .NW(`MEM2_DEPTH),
        .AW(`MEM2_ADDR_WIDTH),
        .INITIALIZE_MEMORY(1)
    ) u_output_mem (
        .clk(clk),
        .cen('0),
        .wen('0),
        .gwen(write_control_n),
        .a(),
        .d(),
        .q()
    );


    // END IMPLEMENTATION


endmodule
