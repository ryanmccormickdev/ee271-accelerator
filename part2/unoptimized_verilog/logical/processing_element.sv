`include "defines.sv"

module processing_element(

    // Clock and Reset Inputs
    input wire clk,
    input wire rst_n,

    // Input Instruction
    input pe_inst_t     pe_inst,
    input logic         pe_inst_valid,

    // Input Operands
    input logic [`PE_INPUT_BITWIDTH-1:0] vector_input,
    input logic [`PE_INPUT_BITWIDTH-1:0] matrix_input,

    // Output Operand
    output logic [`PE_OUTPUT_BITWIDTH-1:0] vector_output


);

    // START IMPLEMENTATION

    // Inputs and out hold 4x8 (INT8), 2x16 (INT16) or 1x32 (INT32) bit lanes; acc lanes are twice
    // as wide. Lane k of a w-bit split is bits [w*k +: w].
    logic [`PE_ACCUMULATION_BITWIDTH-1:0] acc, acc_next;
    logic [`PE_OUTPUT_BITWIDTH-1:0]       out, out_next;

    assign vector_output = out;

    // x / 2^s rounded to nearest, ties to even (same steps as _handle_rnd in the Python simulator)
    function automatic logic [63:0] round_lane(input logic signed [63:0] x, input logic [4:0] s);
        logic signed [63:0] q;
        logic        [63:0] d, r;
        q = x >>> s;            // floor(x / 2^s)
        d = 64'd1 << s;         // 2^s
        r = x & (d - 64'd1);    // x mod 2^s
        if ((2 * r > d) || ((2 * r == d) && q[0]))
            q = q + 64'sd1;
        round_lane = q;
    endfunction

    always_comb begin
        acc_next = acc;
        out_next = out;
        if (pe_inst_valid && pe_inst.opcode == `PE_RND_OPCODE) begin
            case (pe_inst.mode)
                `MODE_INT8:  for (int k = 0; k < 4; k++)
                                 acc_next[16*k +: 16] = 16'(round_lane(64'($signed(acc[16*k +: 16])), pe_inst.value));
                `MODE_INT16: for (int k = 0; k < 2; k++)
                                 acc_next[32*k +: 32] = 32'(round_lane(64'($signed(acc[32*k +: 32])), pe_inst.value));
                `MODE_INT32: acc_next = round_lane(acc, pe_inst.value);
                default: ;
            endcase
        end else if (pe_inst_valid && pe_inst.opcode == `PE_MAC_OPCODE) begin
            case (pe_inst.value)
                `PE_MAC_VALUE: case (pe_inst.mode)
                    `MODE_INT8:  for (int k = 0; k < 4; k++)
                                     acc_next[16*k +: 16] = $signed(acc[16*k +: 16])
                                                          + $signed(vector_input[8*k +: 8]) * $signed(matrix_input[8*k +: 8]);
                    `MODE_INT16: for (int k = 0; k < 2; k++)
                                     acc_next[32*k +: 32] = $signed(acc[32*k +: 32])
                                                          + $signed(vector_input[16*k +: 16]) * $signed(matrix_input[16*k +: 16]);
                    `MODE_INT32: acc_next = $signed(acc) + $signed(vector_input) * $signed(matrix_input);
                    default: ;
                endcase
                `PE_OUT_VALUE: case (pe_inst.mode)     // clamp each acc lane into an output lane
                    `MODE_INT8:  for (int k = 0; k < 4; k++)
                                     out_next[8*k +: 8] = ($signed(acc[16*k +: 16]) >  16'sd127) ? 8'h7f :
                                                          ($signed(acc[16*k +: 16]) < -16'sd128) ? 8'h80 : acc[16*k +: 8];
                    `MODE_INT16: for (int k = 0; k < 2; k++)
                                     out_next[16*k +: 16] = ($signed(acc[32*k +: 32]) >  32'sd32767) ? 16'h7fff :
                                                            ($signed(acc[32*k +: 32]) < -32'sd32768) ? 16'h8000 : acc[32*k +: 16];
                    `MODE_INT32: out_next = ($signed(acc) >  64'sd2147483647) ? 32'h7fffffff :
                                            ($signed(acc) < -64'sd2147483648) ? 32'h80000000 : acc[31:0];
                    default: ;
                endcase
                `PE_PASS_VALUE: case (pe_inst.mode)    // sign-extend the vector lanes into acc
                    `MODE_INT8:  for (int k = 0; k < 4; k++) acc_next[16*k +: 16] = 16'($signed(vector_input[8*k +: 8]));
                    `MODE_INT16: for (int k = 0; k < 2; k++) acc_next[32*k +: 32] = 32'($signed(vector_input[16*k +: 16]));
                    `MODE_INT32: acc_next = 64'($signed(vector_input));
                    default: ;
                endcase
                `PE_CLR_VALUE: begin
                    acc_next = '0;
                    out_next = '0;
                end
                default: ;                              // NOP
            endcase
        end
    end

    always_ff @(posedge clk, negedge rst_n) begin
        if (!rst_n) begin
            acc <= '0;
            out <= '0;
        end else begin
            acc <= acc_next;
            out <= out_next;
        end
    end

    // END IMPLEMENTATION

endmodule
