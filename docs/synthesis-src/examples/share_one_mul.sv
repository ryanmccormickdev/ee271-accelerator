// Same function, way 2: pick the operand first, then one multiplier.
module share_one_mul (
  input  logic        sel,
  input  logic [15:0] a, b, c,
  output logic [31:0] y
);
  assign y = a * (sel ? b : c);
endmodule
