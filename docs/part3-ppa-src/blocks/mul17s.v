// Generic building block: 17x17 signed multiplier, full 34-bit product (combinational).
module mul17s (input signed [16:0] a, input signed [16:0] b, output signed [33:0] p);
  assign p = a * b;
endmodule
