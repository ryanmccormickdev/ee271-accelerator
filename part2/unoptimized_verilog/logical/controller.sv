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

    // cur is the instruction being executed. Each repetition steps its offsets and counts its
    // count down; the repetition with count 0 is the last.
    instruction_t cur;
    logic         last_rep;

    assign last_rep         = (state == EXECUTING) && (cur.count == '0);
    assign inst_exec_begins = inst_valid && ((state == IDLE) || last_rep);  // no gap between instructions

    always_ff @(posedge clk, negedge rst_n) begin
        if (!rst_n) begin
            state <= IDLE;
            cur   <= '0;
        end else if (inst_exec_begins) begin
            state <= EXECUTING;
            cur   <= inst;
        end else if (last_rep) begin
            state <= IDLE;
        end else if (state == EXECUTING) begin
            cur.count                       <= cur.count - 1'b1;
            cur.buf_instruction.mema_offset <= cur.buf_instruction.mema_offset + cur.mema_inc;
            cur.buf_instruction.memb_offset <= cur.buf_instruction.memb_offset + cur.memb_inc;
        end
    end

    assign buf_inst       = cur.buf_instruction;
    assign buf_inst_valid = (state == EXECUTING);

    // The PE half goes out one cycle later, when the buffer's read data arrives.
    always_ff @(posedge clk, negedge rst_n) begin
        if (!rst_n) begin
            pe_inst       <= '0;
            pe_inst_valid <= 1'b0;
        end else begin
            pe_inst       <= cur.pe_instruction;
            pe_inst_valid <= buf_inst_valid;
        end
    end

    // END IMPLEMENTATION

endmodule
