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

    // Reads return data one cycle later, so keep last cycle's vector offset/mode (to pick the
    // element out of the returned word) and whether last cycle was a WRITE.
    logic [`BUF_MEMB_OFFSET_BITWIDTH-1:0] memb_q;
    logic [`BUF_MODE_BITWIDTH-1:0]        mode_q;
    logic                                 wr_pending;
    logic [`MEM2_ADDR_WIDTH-1:0]          wr_addr;

    always_ff @(posedge clk, negedge rst_n) begin
        if (!rst_n) begin
            memb_q     <= '0;
            mode_q     <= '0;
            wr_pending <= 1'b0;
            wr_addr    <= '0;
        end else begin
            memb_q     <= buf_inst.memb_offset;
            mode_q     <= buf_inst.mode;
            wr_pending <= buf_inst_valid && (buf_inst.opcode == `BUF_WRITE);
            wr_addr    <= buf_inst.mema_offset;
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

    // One decoder makes this cycle's MEM1 word address; the other picks last cycle's element.
    logic [`MEM1_ADDR_WIDTH-1:0] mem1_addr;
    logic [`MEM1_BITWIDTH-1:0]   mem1_word;

    vector_decoder u_addr_dec (
        .data_from_mem('0),
        .addr_from_controller(buf_inst.memb_offset),
        .addr_from_controller_reg('0),
        .mode(buf_inst.mode),
        .data_to_pe(),
        .addr_to_mem(mem1_addr)
    );

    vector_decoder u_data_dec (
        .data_from_mem(mem1_word),
        .addr_from_controller('0),
        .addr_from_controller_reg(memb_q),
        .mode(mode_q),
        .data_to_pe(vector_data),
        .addr_to_mem()
    );

    array #(
        .DW(`MEM1_BITWIDTH),
        .NW(`MEM1_DEPTH),
        .AW(`MEM1_ADDR_WIDTH)
    ) u_vector_mem (
        .clk(clk),
        .cen('0),
        .wen('1),
        .gwen('1),
        .a(mem1_addr),
        .d(),
        .q(mem1_word)
    );

    // The PEs' OUT results reach output_data the cycle after the WRITE, so write then.
    logic write_control_n;
    assign write_control_n = ~wr_pending;
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
        .a(wr_addr),
        .d(output_data),
        .q()
    );


    // END IMPLEMENTATION


endmodule
