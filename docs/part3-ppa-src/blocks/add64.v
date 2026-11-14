// Generic building block: 64-bit adder (carry out dropped, i.e. wraps).
module add64 (input [63:0] a, input [63:0] b, output [63:0] s);
  assign s = a + b;
endmodule
