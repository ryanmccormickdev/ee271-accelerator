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
    //
    // The buffer holds the three memories. Each cycle the controller gives it one instruction:
    //   READ:  MEM0[mema_offset] goes out on matrix_data, and one vector element from MEM1 on vector_data.
    //   WRITE: output_data (the PEs' results) is stored in MEM2[mema_offset].
    //   NOP:   nothing.
    // The memories are synchronous: an address given in cycle t gives its data in cycle t+1.
    // Every register below exists only because of that one-cycle delay.

    // ---- MEM0: the matrix ----------------------------------------------------------------------
    // The READ's MemA offset is the word address. The word comes out on matrix_data one cycle later.
    array #(
        .DW(`MEM0_BITWIDTH),
        .NW(`MEM0_DEPTH),
        .AW(`MEM0_ADDR_WIDTH)
    ) u_matrix_mem (
        .clk(clk),
        .cen('0),                       // always on (active-low)
        .wen('1),                       // never write (active-low)
        .gwen('1),
        .a(buf_inst.mema_offset),       // address in cycle t ...
        .d(),                           // (nothing to write)
        .q(matrix_data)                 // ... data in cycle t+1
    );

    // ---- MEM1: the vector ----------------------------------------------------------------------
    // memb_offset counts vector elements, but one 32-bit MEM1 word holds 4 INT8 or 2 INT16 elements.
    // The staff's vector_decoder (in defines.sv) does both halves of that job:
    //   address half: element offset -> word address          needed in cycle t (address goes in)
    //   data half:    pick the element out of the word,       needed in cycle t+1 (word comes out)
    //                 copied into every lane
    // By cycle t+1, buf_inst already shows the next instruction. So the data half uses copies of the
    // READ's offset and mode, saved at the end of cycle t: memb_q and mode_q.

    logic [`BUF_MEMB_OFFSET_BITWIDTH-1:0] memb_q;    // last cycle's MemB offset
    logic [`BUF_MODE_BITWIDTH-1:0]        mode_q;    // last cycle's mode

    always_ff @(posedge clk, negedge rst_n) begin
        if (!rst_n) begin
            memb_q <= '0;
            mode_q <= '0;
        end else begin
            memb_q <= buf_inst.memb_offset;
            mode_q <= buf_inst.mode;
        end
    end

    logic [`MEM1_ADDR_WIDTH-1:0] mem1_addr;          // word address going into MEM1 (cycle t)
    logic [`MEM1_BITWIDTH-1:0]   mem1_word;          // word coming out of MEM1 (cycle t+1)

    // Two copies of the decoder, one per half. In each copy the other half is unused:
    // its inputs get '0 and its output is left unconnected.
    vector_decoder u_addr_dec (                      // address half: this cycle's offset and mode
        .data_from_mem('0),
        .addr_from_controller(buf_inst.memb_offset),
        .addr_from_controller_reg('0),
        .mode(buf_inst.mode),
        .data_to_pe(),
        .addr_to_mem(mem1_addr)
    );

    vector_decoder u_data_dec (                      // data half: last cycle's offset and mode
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
        .cen('0),                       // always on
        .wen('1),                       // never write
        .gwen('1),
        .a(mem1_addr),                  // address in cycle t ...
        .d(),
        .q(mem1_word)                   // ... word in cycle t+1, into the data-half decoder
    );

    // ---- MEM2: the results ---------------------------------------------------------------------
    // A tile ends with NOP | OUT followed by WRITE | NOP. The PE half runs one cycle behind the buffer
    // half, so the OUT reaches the PEs in the same cycle as the WRITE, and the new results only appear
    // on output_data in the cycle after the WRITE. So the buffer writes one cycle late: it remembers
    // that a write is pending, and where, and writes output_data during the next cycle.

    logic                        wr_pending;         // 1 = last cycle had a valid WRITE
    logic [`MEM2_ADDR_WIDTH-1:0] wr_addr;            // that WRITE's address

    always_ff @(posedge clk, negedge rst_n) begin
        if (!rst_n) begin
            wr_pending <= 1'b0;
            wr_addr    <= '0;
        end else begin
            wr_pending <= buf_inst_valid && (buf_inst.opcode == `BUF_WRITE);
            wr_addr    <= buf_inst.mema_offset;
        end
    end

    logic write_control_n;
    assign write_control_n = ~wr_pending;            // MEM2's write enable is active-low

    array #(
        .DW(`MEM2_BITWIDTH),
        .NW(`MEM2_DEPTH),
        .AW(`MEM2_ADDR_WIDTH),
        .INITIALIZE_MEMORY(1)
    ) u_output_mem (
        .clk(clk),
        .cen('0),                       // always on
        .wen('0),                       // bit mask: all bits written when a write happens
        .gwen(write_control_n),         // write only when a write is pending
        .a(wr_addr),
        .d(output_data),
        .q()                            // (the design never reads MEM2 back)
    );


    // END IMPLEMENTATION


endmodule
