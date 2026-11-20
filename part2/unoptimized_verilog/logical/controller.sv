`include "defines.sv"

module controller(

    // Clock and Reset
    input wire clk,
    input wire rst_n,

    // Input Instruction
    input  instruction_t inst,
    input  logic         inst_valid,
    output logic         inst_exec_begins,

    // Output Instructions to PEs/Buffer
    output pe_inst_t     pe_inst,
    output logic         pe_inst_valid,
    output buf_inst_t    buf_inst,
    output logic         buf_inst_valid

);

    typedef enum {IDLE, EXECUTING} fsm_t;
    fsm_t state;

    // START IMPLEMENTATION
    //
    // The controller takes instructions from the instruction memory and sends each one out Count+1
    // times ("repetitions"), one per cycle: the buffer half to the buffer, the PE half to the PEs.
    // After each repetition, the buffer offsets step by MemAIncrement / MemBIncrement.
    //   IDLE:      nothing to send (after reset, and once the program has run out).
    //   EXECUTING: sending repetitions of cur.
    // The PE half goes out one cycle after the buffer half, because a READ's data arrives a cycle late.

    instruction_t                          cur;            // the instruction being executed
    logic [`CONTROLLER_COUNT_BITWIDTH-1:0] remaining;      // repetitions left after this one
    logic [`BUF_MEMA_OFFSET_BITWIDTH-1:0]  mema_offset;    // this repetition's offsets
    logic [`BUF_MEMB_OFFSET_BITWIDTH-1:0]  memb_offset;

    // 1 during the last repetition of cur.
    logic last_rep;
    assign last_rep = (state == EXECUTING) && (remaining == '0);

    // 1 when we accept the next instruction this cycle: there is one, and we're idle or on the last
    // repetition. Taking it during the last repetition means its first repetition goes out in the
    // very next cycle, so there is no gap ("bubble") between instructions.
    logic take;
    assign take = inst_valid && ((state == IDLE) || last_rep);

    // Tells the instruction memory to move on to the next instruction.
    assign inst_exec_begins = take;

    always_ff @(posedge clk, negedge rst_n) begin
        if (!rst_n) begin
            state       <= IDLE;
            cur         <= '0;
            remaining   <= '0;
            mema_offset <= '0;
            memb_offset <= '0;
        end else if (take) begin
            // Start the next instruction. This is checked before the EXECUTING branch below,
            // so on a last repetition with a next instruction waiting, the take wins.
            state       <= EXECUTING;
            cur         <= inst;
            remaining   <= inst.count;      // count + 1 repetitions: this one, then count more
            mema_offset <= inst.buf_instruction.mema_offset;
            memb_offset <= inst.buf_instruction.memb_offset;
        end else if (state == EXECUTING) begin
            if (last_rep) begin
                state <= IDLE;              // finished, and no next instruction to take
            end else begin
                remaining   <= remaining - 1'b1;
                mema_offset <= mema_offset + cur.mema_inc;
                memb_offset <= memb_offset + cur.memb_inc;
            end
        end
    end

    // Buffer half: sent every cycle while EXECUTING, starting the cycle after the take.
    assign buf_inst_valid       = (state == EXECUTING);
    assign buf_inst.opcode      = cur.buf_instruction.opcode;
    assign buf_inst.mode        = cur.buf_instruction.mode;
    assign buf_inst.mema_offset = mema_offset;
    assign buf_inst.memb_offset = memb_offset;

    // PE half: the same repetition one cycle later (a register delays it), so each PE operation
    // runs in the cycle its READ's data is on matrix_data / vector_data.
    always_ff @(posedge clk, negedge rst_n) begin
        if (!rst_n) begin
            pe_inst       <= '0;
            pe_inst_valid <= 1'b0;
        end else begin
            pe_inst       <= cur.pe_instruction;
            pe_inst_valid <= (state == EXECUTING);
        end
    end

    // END IMPLEMENTATION

endmodule
