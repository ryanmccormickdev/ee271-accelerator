// Generic building block: 4:1 multiplexer, 32 bits wide.
module mux4_32 (input [1:0] sel, input [31:0] d0, input [31:0] d1, input [31:0] d2, input [31:0] d3, output reg [31:0] y);
  always @(*)
    case (sel)
      2'd0: y = d0;
      2'd1: y = d1;
      2'd2: y = d2;
      default: y = d3;
    endcase
endmodule
